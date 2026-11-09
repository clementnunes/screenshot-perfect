import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  audit,
  createApplication,
  findApplicationByToken,
  getInterviewQuestions,
  issueCandidateLink,
  notify,
  runCvAnalysis,
  runInterviewAnalysis,
  storeCv,
} from "./recruitment.server";

const cvInput = z.object({
  name: z.string().min(1).max(200),
  base64: z.string().min(10),
  pages: z.array(z.string()).max(40),
});

async function assertRecruiter(supabase: { rpc: (fn: "is_recruiter") => PromiseLike<{ data: boolean | null }> }) {
  const { data } = await supabase.rpc("is_recruiter");
  if (!data) throw new Error("Accès réservé aux recruteurs.");
}

// ---------------- Recruiter ----------------

export const addApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ jobId: z.string().uuid(), fullName: z.string().trim().min(2).max(120), email: z.string().trim().email().max(255), cv: cvInput.optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertRecruiter(context.supabase as never);
    const { applicationId, duplicate } = await createApplication({ jobId: data.jobId, fullName: data.fullName, email: data.email, source: "recruiter" });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: job } = await supabaseAdmin.from("jobs").select("link_validity_days").eq("id", data.jobId).single();
    const link = await issueCandidateLink(applicationId, job?.link_validity_days ?? 14);
    if (data.cv) {
      await storeCv(applicationId, data.cv);
      await runCvAnalysis(applicationId);
    }
    return { token: link.token, expiresAt: link.expiresAt, duplicate };
  });

export const regenerateCandidateLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ applicationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertRecruiter(context.supabase as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: app } = await supabaseAdmin.from("applications").select("jobs(link_validity_days)").eq("id", data.applicationId).single();
    const link = await issueCandidateLink(data.applicationId, app?.jobs?.link_validity_days ?? 14);
    await audit(context.userId, "link_regenerated", "application", data.applicationId);
    return link;
  });

export const revokeCandidateLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ applicationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertRecruiter(context.supabase as never);
    await context.supabase.from("applications").update({ token_revoked: true }).eq("id", data.applicationId);
    await audit(context.userId, "link_revoked", "application", data.applicationId);
    return { ok: true };
  });

export const retryCvAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ applicationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertRecruiter(context.supabase as never);
    return runCvAnalysis(data.applicationId);
  });

export const retryInterviewAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ applicationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertRecruiter(context.supabase as never);
    return runInterviewAnalysis(data.applicationId);
  });

export const recordDecision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      applicationId: z.string().uuid(),
      decision: z.enum(["invite_meeting", "request_verification", "reject"]),
      comment: z.string().max(2000).optional(),
      confirmed: z.literal(true),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertRecruiter(context.supabase as never);
    const email = (context.claims as { email?: string }).email ?? null;
    const { error } = await context.supabase.from("recruitment_decisions").insert({
      application_id: data.applicationId,
      decision: data.decision,
      comment: data.comment ?? null,
      decided_by: context.userId,
      decided_by_email: email,
    });
    if (error) throw new Error(error.message);
    // Verification keeps the file open; meeting invite and refusal close it.
    const status = data.decision === "request_verification" ? "to_review" : "decided";
    await context.supabase.from("applications").update({ status }).eq("id", data.applicationId);
    await audit(context.userId, "decision_" + data.decision, "application", data.applicationId, { comment: data.comment ?? null });
    await notify("recruitment_decision", data.applicationId, { decision: data.decision, decided_by: email });
    return { ok: true };
  });

/** Droit à l'effacement : supprime le candidat, ses candidatures et ses CV. */
export const eraseCandidate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ candidateId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertRecruiter(context.supabase as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: apps } = await supabaseAdmin.from("applications").select("id, cv_path").eq("candidate_id", data.candidateId);
    const paths = (apps ?? []).map((a) => a.cv_path).filter((p): p is string => !!p);
    if (paths.length) await supabaseAdmin.storage.from("cvs").remove(paths);
    await supabaseAdmin.from("candidates").delete().eq("id", data.candidateId);
    await audit(context.userId, "candidate_erased", "candidate", data.candidateId, { applications: apps?.length ?? 0 });
    return { ok: true };
  });

// ---------------- Candidate (public, token-scoped) ----------------

const tokenInput = z.object({ token: z.string().min(20).max(200) });

async function requireApp(token: string) {
  const app = await findApplicationByToken(token);
  if (!app) throw new Error("Ce lien est invalide, expiré ou a été révoqué.");
  return app;
}

export const getCandidateSession = createServerFn({ method: "POST" })
  .inputValidator((d) => tokenInput.parse(d))
  .handler(async ({ data }) => {
    const app = await findApplicationByToken(data.token);
    if (!app) return { valid: false as const };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: interview } = await supabaseAdmin.from("interviews").select("*").eq("application_id", app.id).maybeSingle();
    const questions = interview ? await getInterviewQuestions(app.job_id, app.id) : [];
    const { data: answers } = interview
      ? await supabaseAdmin.from("interview_answers").select("question_id, answer_text, input_mode").eq("interview_id", interview.id)
      : { data: [] };
    return {
      valid: true as const,
      job: { title: app.jobs.title, location: app.jobs.location, contract: app.jobs.contract_type, invitation: app.jobs.invitation_message, confirmation: app.jobs.confirmation_message },
      candidate: { firstName: app.candidates.full_name.split(" ")[0] },
      identityConfirmed: !!app.identity_confirmed_at,
      hasCv: !!app.cv_path,
      analysisStatus: app.analysis_status,
      expiresAt: app.token_expires_at,
      interview: interview
        ? {
            status: interview.status,
            currentIndex: interview.current_index,
            questions: questions.map((q) => ({ id: q.id, question: q.question, kind: q.kind })),
            answers: answers ?? [],
          }
        : null,
    };
  });

export const confirmCandidateIdentity = createServerFn({ method: "POST" })
  .inputValidator((d) => tokenInput.extend({ email: z.string().trim().email().max(255), consent: z.literal(true) }).parse(d))
  .handler(async ({ data }) => {
    const app = await requireApp(data.token);
    if (app.candidates.email.toLowerCase() !== data.email.toLowerCase()) {
      throw new Error("Cette adresse email ne correspond pas à votre candidature.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();
    await supabaseAdmin.from("applications").update({ identity_confirmed_at: now, consent_at: now }).eq("id", app.id);
    await audit("candidate", "identity_confirmed", "application", app.id);
    return { ok: true };
  });

export const uploadCandidateCv = createServerFn({ method: "POST" })
  .inputValidator((d) => tokenInput.extend({ cv: cvInput }).parse(d))
  .handler(async ({ data }) => {
    const app = await requireApp(data.token);
    if (!app.identity_confirmed_at) throw new Error("Veuillez d'abord confirmer votre identité.");
    if (app.cv_path) throw new Error("Un CV a déjà été transmis.");
    await storeCv(app.id, data.cv);
    await notify("candidate_received", app.id, { job_title: app.jobs.title });
    return runCvAnalysis(app.id);
  });

export const saveCandidateAnswer = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    tokenInput.extend({ questionId: z.string().uuid(), text: z.string().max(5000), mode: z.enum(["text", "voice"]), nextIndex: z.number().int().min(0).max(5) }).parse(d),
  )
  .handler(async ({ data }) => {
    const app = await requireApp(data.token);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: interview } = await supabaseAdmin.from("interviews").select("*").eq("application_id", app.id).single();
    if (!interview) throw new Error("Pré-entretien indisponible.");
    if (interview.status === "completed") throw new Error("Le pré-entretien est déjà terminé.");
    const questions = await getInterviewQuestions(app.job_id, app.id);
    if (!questions.some((q) => q.id === data.questionId)) throw new Error("Question inconnue.");
    await supabaseAdmin
      .from("interview_answers")
      .upsert({ interview_id: interview.id, question_id: data.questionId, answer_text: data.text, input_mode: data.mode, updated_at: new Date().toISOString() }, { onConflict: "interview_id,question_id" });
    await supabaseAdmin
      .from("interviews")
      .update({ status: "in_progress", current_index: data.nextIndex, started_at: interview.started_at ?? new Date().toISOString() })
      .eq("id", interview.id)
      .neq("status", "completed");
    return { ok: true, savedAt: new Date().toISOString() };
  });

export const completeCandidateInterview = createServerFn({ method: "POST" })
  .inputValidator((d) => tokenInput.parse(d))
  .handler(async ({ data }) => {
    const app = await requireApp(data.token);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: interview } = await supabaseAdmin.from("interviews").select("*").eq("application_id", app.id).single();
    if (!interview) throw new Error("Pré-entretien indisponible.");
    if (interview.status !== "completed") {
      const questions = await getInterviewQuestions(app.job_id, app.id);
      const { data: answers } = await supabaseAdmin.from("interview_answers").select("question_id, answer_text").eq("interview_id", interview.id);
      const missing = questions.filter((q) => !answers?.find((a) => a.question_id === q.id && a.answer_text.trim()));
      if (missing.length) throw new Error("Merci de répondre à toutes les questions avant de valider.");
      await supabaseAdmin.from("interviews").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", interview.id);
      if (app.status !== "decided") await supabaseAdmin.from("applications").update({ status: "interview_done" }).eq("id", app.id);
      await audit("candidate", "interview_completed", "application", app.id);
      await notify("interview_completed", app.id, { job_title: app.jobs.title });
      await runInterviewAnalysis(app.id);
    }
    return { ok: true };
  });
