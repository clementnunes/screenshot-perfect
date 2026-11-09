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
    z.object({ jobId: z.string().uuid(), fullName: z.string().trim().min(2).max(120), email: z.string().trim().email().max(255), cv: cvInput.optional(), analyze: z.boolean().default(true), preserveDuplicate: z.boolean().default(false) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertRecruiter(context.supabase as never);
    const { applicationId, duplicate } = await createApplication({ jobId: data.jobId, fullName: data.fullName, email: data.email, source: "recruiter" });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: job } = await supabaseAdmin.from("jobs").select("link_validity_days").eq("id", data.jobId).single();
    const link = await issueCandidateLink(applicationId, job?.link_validity_days ?? 14);
    if (data.cv && !(duplicate && data.preserveDuplicate)) {
      await storeCv(applicationId, data.cv);
      if (data.analyze) await runCvAnalysis(applicationId);
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

export const requestInterview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ applicationId: z.string().uuid(), origin: z.string().url() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertRecruiter(context.supabase as never);
    const { getRequest } = await import("@tanstack/react-start/server");
    const origin = getRequest().headers.get("origin");
    if (!origin || new URL(data.origin).origin !== origin) throw new Error("Origine d’invitation invalide.");
    const { requestN8nInterview } = await import("./recruitment.server");
    return requestN8nInterview(data.applicationId, data.origin);
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
  .inputValidator((d) => z.object({ applicationId: z.string().uuid(), bulk: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertRecruiter(context.supabase as never);
    const { CV_BULK_ANALYSIS_WEBHOOK_URL, CV_ANALYSIS_WEBHOOK_URL } = await import("./recruitment.server");
    return runCvAnalysis(data.applicationId, data.bulk ? CV_BULK_ANALYSIS_WEBHOOK_URL : CV_ANALYSIS_WEBHOOK_URL);
  });

export const retryInterviewAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ applicationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertRecruiter(context.supabase as never);
    await notify("interview_summary_requested", data.applicationId, {}, true);
    return { ok: true };
  });

export const testInterviewSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ applicationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertRecruiter(context.supabase as never);
    const { sendInterviewForSummary } = await import("./recruitment.server");
    return sendInterviewForSummary(data.applicationId);
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

/** Supprime des candidatures (et leur CV) choisies par le recruteur. */
export const deleteApplications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ applicationIds: z.array(z.string().uuid()).min(1).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertRecruiter(context.supabase as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: apps } = await supabaseAdmin.from("applications").select("id, cv_path").in("id", data.applicationIds);
    const paths = (apps ?? []).map((a) => a.cv_path).filter((p): p is string => !!p);
    if (paths.length) await supabaseAdmin.storage.from("cvs").remove(paths);
    const { error } = await supabaseAdmin.from("applications").delete().in("id", data.applicationIds);
    if (error) throw new Error(error.message);
    for (const a of apps ?? []) await audit(context.userId, "application_deleted", "application", a.id);
    return { ok: true, deleted: apps?.length ?? 0 };
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
            submittedAt: interview.completed_at,
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
    tokenInput.extend({ questionId: z.string().uuid(), text: z.string().max(5000), mode: z.enum(["text", "voice"]), nextIndex: z.number().int().min(0).max(10000) }).parse(d),
  )
  .handler(async ({ data }) => {
    throw new Error("Connectez-vous au portail candidat avec le lien reçu par e-mail.");
  });

export const completeCandidateInterview = createServerFn({ method: "POST" })
  .inputValidator((d) => tokenInput.parse(d))
  .handler(async ({ data }) => {
    throw new Error("Connectez-vous au portail candidat avec le lien reçu par e-mail.");
  });
