import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
const accessInput = z.object({ token: z.string().min(20).max(200), email: z.string().trim().email().max(255) });

export const requestCandidateAccess = createServerFn({ method: "POST" })
  .inputValidator((d) => accessInput.parse(d))
  .handler(async ({ data }) => {
    const { findApplicationByToken } = await import("./recruitment.server");
    const { canAccessByLink } = await import("./interview-contract");
    const app = await findApplicationByToken(data.token);
    if (!app || !canAccessByLink(app, app.candidates.email, data.email)) throw new Error("Ce lien ou cette adresse e-mail ne correspond pas à une candidature active.");
    if (!app.cv_path) throw new Error("Veuillez d’abord déposer votre CV avec votre lien candidat.");
    await assertThresholdMet(app.id);
    const { prepareExistingQuestions } = await import("./candidate-portal.server");
    await prepareExistingQuestions(app.id, app.job_id);
    const { setCookie, getRequest, deleteCookie } = await import("@tanstack/react-start/server");
    deleteCookie("orvane-candidate-test", { path: "/" });
    const secure = new URL(getRequest().url).protocol === "https:";
    setCookie("orvane-candidate", data.token, { httpOnly: true, secure, sameSite: secure ? "none" : "lax", path: "/", expires: new Date(app.token_expires_at ?? Date.now()) });
    return { ok: true };
  });

const emailField = z.string().trim().email().max(255);
const withEmail = z.object({ email: emailField.optional() });

async function assertThresholdMet(applicationId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { requiresInterview } = await import("./recruitment");
  const { data, error } = await supabaseAdmin.from("applications").select("match_score, jobs(match_threshold)").eq("id", applicationId).maybeSingle();
  if (error) throw error;
  const threshold = (data?.jobs as { match_threshold?: number | null } | null)?.match_threshold;
  if (!data || !requiresInterview(data.match_score, threshold)) throw new Error("Le pré-entretien n’est pas ouvert pour cette candidature.");
}

async function findTestApplicationId(email: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: candidate, error } = await supabaseAdmin.from("candidates").select("id").ilike("email", email.trim()).limit(1).maybeSingle();
  if (error) throw error;
  if (!candidate) throw new Error("Aucune candidature pour cette adresse e-mail.");
  const { data: app, error: appError } = await supabaseAdmin.from("applications").select("id,job_id,cv_path").eq("candidate_id", candidate.id).not("cv_path", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (appError) throw appError;
  if (!app?.cv_path) throw new Error("Aucun CV disponible pour cette candidature.");
  await assertThresholdMet(app.id);
  return app;
}

export const requestCandidateTestAccess = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ email: emailField }).parse(d))
  .handler(async ({ data }) => {
    const app = await findTestApplicationId(data.email);
    const { prepareExistingQuestions } = await import("./candidate-portal.server");
    await prepareExistingQuestions(app.id, app.job_id);
    const { setCookie, deleteCookie } = await import("@tanstack/react-start/server");
    deleteCookie("orvane-candidate", { path: "/" });
    // The browser also keeps the email and sends it with each call, so access survives blocked iframe cookies.
    setCookie("orvane-candidate-test", app.id, { httpOnly: true, secure: true, sameSite: "none", partitioned: true, path: "/", maxAge: 7 * 24 * 3600 });
    return { ok: true };
  });

export const leaveCandidatePortal = createServerFn({ method: "POST" }).handler(async () => {
  const { deleteCookie } = await import("@tanstack/react-start/server");
  deleteCookie("orvane-candidate", { path: "/" });
  deleteCookie("orvane-candidate-test", { path: "/" });
  return { ok: true };
});

async function requireCandidate(email?: string) {
  const { getCookie } = await import("@tanstack/react-start/server");
  const testId = email ? (await findTestApplicationId(email)).id : getCookie("orvane-candidate-test");
  if (testId) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: app, error } = await supabaseAdmin.from("applications").select("*, candidates(full_name,email), jobs(*), interviews(*)").eq("id", z.string().uuid().parse(testId)).maybeSingle();
    if (error) throw error;
    if (!app) throw new Error("Candidature de test introuvable.");
    await assertThresholdMet(app.id);
    return app;
  }
  const { findApplicationByToken } = await import("./recruitment.server");
  const { canAccessByLink } = await import("./interview-contract");
  const token = getCookie("orvane-candidate");
  const app = token ? await findApplicationByToken(token) : null;
  if (!app || !canAccessByLink(app, app.candidates.email, app.candidates.email)) throw new Error("Votre lien candidat est invalide, expiré ou révoqué.");
  await assertThresholdMet(app.id);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: interview, error } = await supabaseAdmin.from("interviews").select("*").eq("application_id", app.id).maybeSingle();
  if (error) throw error;
  return { ...app, interviews: interview };
}

export const getPortalSession = createServerFn({ method: "POST" }).inputValidator((d) => withEmail.parse(d ?? {})).handler(async ({ data }) => {
  const app = await requireCandidate(data.email);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const iv = app.interviews;
  if (!iv) throw new Error("Pré-entretien indisponible.");
  const [{ data: questions, error }, { data: answers }] = await Promise.all([
    supabaseAdmin.from("interview_questions").select("id,question,kind,position").eq("application_id", app.id).order("position"),
    supabaseAdmin.from("interview_answers").select("question_id,answer_text,updated_at").eq("interview_id", iv.id),
  ]);
  if (error) throw error;
  return { job: { title: app.jobs.title, location: app.jobs.location, contract_type: app.jobs.contract_type, confirmation_message: app.jobs.confirmation_message }, firstName: app.candidates.full_name.split(" ")[0], expiresAt: app.token_expires_at, consent: !!app.consent_at, status: iv.status, currentIndex: iv.current_index, startedAt: iv.started_at, submittedAt: iv.completed_at, questions: questions ?? [], answers: answers ?? [] };
});

export const startPortalInterview = createServerFn({ method: "POST" }).inputValidator((d) => z.object({ consent: z.literal(true), email: emailField.optional() }).parse(d)).handler(async ({ data }) => {
  const app = await requireCandidate(data.email);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const now = new Date().toISOString();
  const identity = await supabaseAdmin.from("applications").update({ identity_confirmed_at: now, consent_at: now }).eq("id", app.id);
  if (identity.error) throw identity.error;
  const started = await supabaseAdmin.from("interviews").update({ status: "in_progress", started_at: app.interviews?.started_at ?? now }).eq("application_id", app.id).neq("status", "completed");
  if (started.error) throw started.error;
  return { ok: true };
});

export const savePortalAnswer = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ questionId: z.string().uuid(), text: z.string().max(5000), index: z.number().int().min(0), email: emailField.optional() }).parse(d))
  .handler(async ({ data }) => {
    const app = await requireCandidate(data.email);
    if (!app.consent_at) throw new Error("Veuillez accepter le traitement de vos réponses.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const saved = await supabaseAdmin.rpc("save_portal_answer", { p_application: app.id, p_question: data.questionId, p_text: data.text, p_index: data.index });
    if (saved.error) throw saved.error;
    const { sendInterviewForSummary } = await import("./recruitment.server");
    await sendInterviewForSummary(app.id, "answer_saved");
    return { savedAt: saved.data };
  });

export const submitPortalInterview = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ confirmed: z.literal(true), email: emailField.optional() }).parse(d))
  .handler(async ({ data }) => {
    const app = await requireCandidate(data.email);
    if (!app.consent_at) throw new Error("Veuillez accepter le traitement de vos réponses.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const submitted = await supabaseAdmin.rpc("submit_portal_interview", { p_application: app.id });
    if (submitted.error) throw submitted.error;
    if (app.interviews?.status !== "completed") {
      const { notify, audit, sendInterviewForSummary } = await import("./recruitment.server");
      await audit("candidate", "interview_submitted", "application", app.id);
      await sendInterviewForSummary(app.id);
      await notify("interview_submit", app.id, { interview_id: submitted.data, submitted_at: new Date().toISOString() });
    }
    return { ok: true };
  });