import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const notice = "Si une invitation correspond à cette adresse, vous recevrez un e-mail contenant votre lien d'accès.";

export const requestCandidateAccess = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ email: z.string().trim().email().max(255), origin: z.string().url() }).parse(d))
  .handler(async ({ data }) => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const actualOrigin = getRequest().headers.get("origin");
    if (!actualOrigin || new URL(data.origin).origin !== actualOrigin) throw new Error("Origine de connexion invalide.");
    const { candidateApplication } = await import("./candidate-portal.server");
    const app = await candidateApplication(data.email);
    if (app) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin.auth.signInWithOtp({ email: app.candidates.email, options: { shouldCreateUser: false, emailRedirectTo: `${new URL(data.origin).origin}/espace-candidat` } });
      if (error) console.error("Candidate access email refused", error.status, error.code);
    }
    return { message: notice };
  });

async function requireCandidate(userId: string, client: { auth: { getUser: () => Promise<{ data: { user: { id: string; email?: string } | null } }> } }) {
  const { data: { user } } = await client.auth.getUser();
  if (!user?.email || user.id !== userId) throw new Error("Connectez-vous avec le lien reçu par e-mail.");
  const { candidateApplication } = await import("./candidate-portal.server");
  const app = await candidateApplication(user.email);
  if (!app) throw new Error("Votre invitation est invalide, expirée ou révoquée.");
  return app;
}

export const getPortalSession = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const app = await requireCandidate(context.userId, context.supabase);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const iv = app.interviews;
  if (!iv) throw new Error("Pré-entretien indisponible.");
  const [{ data: questions, error }, { data: answers }] = await Promise.all([
    supabaseAdmin.from("interview_questions").select("id,question,kind,position").eq("application_id", app.id).order("position"),
    supabaseAdmin.from("interview_answers").select("question_id,answer_text,updated_at").eq("interview_id", iv.id),
  ]);
  if (error) throw error;
  return { job: app.jobs, firstName: app.candidates.full_name.split(" ")[0], expiresAt: app.token_expires_at, consent: !!app.consent_at, status: iv.status, currentIndex: iv.current_index, startedAt: iv.started_at, submittedAt: iv.completed_at, questions: questions ?? [], answers: answers ?? [] };
});

export const startPortalInterview = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((d) => z.object({ consent: z.literal(true) }).parse(d)).handler(async ({ context }) => {
  const app = await requireCandidate(context.userId, context.supabase);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const now = new Date().toISOString();
  const identity = await supabaseAdmin.from("applications").update({ identity_confirmed_at: now, consent_at: now }).eq("id", app.id);
  if (identity.error) throw identity.error;
  const started = await supabaseAdmin.from("interviews").update({ status: "in_progress", started_at: app.interviews?.started_at ?? now }).eq("application_id", app.id).neq("status", "completed");
  if (started.error) throw started.error;
  return { ok: true };
});

export const savePortalAnswer = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ questionId: z.string().uuid(), text: z.string().max(5000), index: z.number().int().min(0) }).parse(d))
  .handler(async ({ data, context }) => {
    const app = await requireCandidate(context.userId, context.supabase);
    if (!app.consent_at) throw new Error("Veuillez accepter le traitement de vos réponses.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const saved = await supabaseAdmin.rpc("save_portal_answer", { p_application: app.id, p_question: data.questionId, p_text: data.text, p_index: data.index });
    if (saved.error) throw saved.error;
    return { savedAt: saved.data };
  });

export const submitPortalInterview = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ confirmed: z.literal(true) }).parse(d))
  .handler(async ({ context }) => {
    const app = await requireCandidate(context.userId, context.supabase);
    if (!app.consent_at) throw new Error("Veuillez accepter le traitement de vos réponses.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const submitted = await supabaseAdmin.rpc("submit_portal_interview", { p_application: app.id });
    if (submitted.error) throw submitted.error;
    if (app.interviews?.status !== "completed") {
      const { notify, audit } = await import("./recruitment.server");
      await audit("candidate", "interview_submitted", "application", app.id);
      await notify("interview_submit", app.id, { interview_id: submitted.data, submitted_at: new Date().toISOString() });
    }
    return { ok: true };
  });