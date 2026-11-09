// Server-only recruitment workflows (CV analysis, interview analysis, tokens, notifications).
import { generateResponse } from "@lovable.dev/ai-gateway";
import { z } from "zod";
import { readSecret } from "./runtime-env";
import { prepareExistingQuestions } from "./candidate-portal.server";
import { parseCvResult } from "./cv-contract";
export { parseCvResult };

export const CV_BULK_ANALYSIS_WEBHOOK_URL = "https://nmudhoo.n8n-wsk.com/webhook-test/a4da0844-bdf2-498c-ab39-181adaa00475";
export const INTERVIEW_SUMMARY_WEBHOOK_URL = "https://nmudhoo.n8n-wsk.com/webhook-test/ed7b87a7-9c58-44f3-8529-956fadf981ce";
export const CV_ANALYSIS_WEBHOOK_URL = "https://nmudhoo.n8n-wsk.com/webhook/a4da0844-bdf2-498c-ab39-181adaa00474";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  computeMatchScore,
  computeCategoryScore,
  type CvAnalysisView,
  type InterviewSummary,
} from "./recruitment";

const MODEL = "openai/gpt-6-astra" as const;

// ---------- tokens ----------
export function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Rotates the candidate link: the previous link stops working immediately. */
export async function issueCandidateLink(applicationId: string, validityDays: number) {
  const token = generateToken();
  const expires = new Date(Date.now() + validityDays * 86400_000).toISOString();
  const { error } = await supabaseAdmin
    .from("applications")
    .update({ access_token_hash: await hashToken(token), token_expires_at: expires, token_revoked: false })
    .eq("id", applicationId);
  if (error) throw new Error(error.message);
  return { token, expiresAt: expires };
}

export async function findApplicationByToken(token: string) {
  if (!token || token.length < 20) return null;
  const { data } = await supabaseAdmin
    .from("applications")
    .select("*, candidates(*), jobs(*)")
    .eq("access_token_hash", await hashToken(token))
    .maybeSingle();
  if (!data) return null;
  if (data.token_revoked) return null;
  if (data.token_expires_at && new Date(data.token_expires_at) < new Date()) return null;
  return data;
}

// ---------- audit & notifications ----------
export async function audit(actor: string, action: string, entity: string, entityId: string | null, details: Record<string, unknown> = {}) {
  await supabaseAdmin.from("audit_logs").insert({ actor, action, entity, entity_id: entityId, details: details as never });
}

/** Records a notification and forwards it to n8n when an outbound URL is configured. */
/** Sends the finished pre-interview questions and answers to n8n, which owns the summary. */
export async function sendInterviewForSummary(applicationId: string) {
  const { data: app } = await supabaseAdmin.from("applications").select("id, job_id, candidates(full_name, email), jobs(title), interviews(id, completed_at)").eq("id", applicationId).single();
  const iv = Array.isArray(app?.interviews) ? app?.interviews[0] : app?.interviews;
  if (!app || !iv) throw new Error("Aucun pré-entretien pour ce candidat.");
  const [{ data: questions }, { data: answers }] = await Promise.all([
    supabaseAdmin.from("interview_questions").select("id, question, kind, position").eq("application_id", applicationId).order("position"),
    supabaseAdmin.from("interview_answers").select("question_id, answer_text").eq("interview_id", iv.id),
  ]);
  const byQ = new Map((answers ?? []).map((a) => [a.question_id, a.answer_text]));
  try {
    const res = await fetch(INTERVIEW_SUMMARY_WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-webhook-secret": readSecret("N8N_WEBHOOK_SECRET") ?? "", "idempotency-key": iv.id },
      body: JSON.stringify({
        type: "interview_summary_requested",
        application_id: applicationId,
        interview_id: iv.id,
        submitted_at: iv.completed_at,
        job: { id: app.job_id, title: app.jobs?.title },
        candidate: { full_name: app.candidates?.full_name },
        qa: (questions ?? []).map((q) => ({ position: q.position, kind: q.kind, question: q.question, answer: byQ.get(q.id) ?? "" })),
      }),
    });
    await audit("n8n", res.ok ? "interview_summary_sent" : "interview_summary_failed", "application", applicationId, { status: res.status });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    await audit("n8n", "interview_summary_failed", "application", applicationId, { message: e instanceof Error ? e.message : String(e) });
    return { ok: false, status: 0 };
  }
}

export async function notify(type: string, applicationId: string | null, payload: Record<string, unknown>, required = false) {
  const url = readSecret("N8N_OUTBOUND_URL");
  if (!url && required) throw new Error("Le workflow n8n n’est pas encore connecté.");
  const { data } = await supabaseAdmin
    .from("notifications")
    .insert({ type, application_id: applicationId, payload: payload as never })
    .select("id")
    .single();
  if (!url) return;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-webhook-secret": readSecret("N8N_WEBHOOK_SECRET") ?? "",
        "idempotency-key": data?.id ?? crypto.randomUUID(),
      },
      body: JSON.stringify({ type, application_id: applicationId, ...payload }),
    });
    if (data) await supabaseAdmin.from("notifications").update({ status: res.ok ? "sent" : "failed" }).eq("id", data.id);
    if (!res.ok) throw new Error(`n8n (${res.status}) : ${await res.text()}`);
  } catch (error) {
    if (data) await supabaseAdmin.from("notifications").update({ status: "failed" }).eq("id", data.id);
    if (required) throw error;
  }
}

export async function requestN8nInterview(applicationId: string, origin: string) {
  const { data: app, error } = await supabaseAdmin.from("applications").select("*, candidates(full_name, email), jobs(*)").eq("id", applicationId).single();
  if (error || !app) throw new Error("Candidature introuvable.");
  const { data: iv } = await supabaseAdmin.from("interviews").select("status,invited_at").eq("application_id", applicationId).maybeSingle();
  if (iv?.status === "completed") throw new Error("Ce pré-entretien a déjà été soumis.");
  if (app.status === "decided") throw new Error("Une décision a déjà été prise.");
  if (!app.cv_path) throw new Error("Un CV est nécessaire.");
  await prepareExistingQuestions(applicationId, app.job_id);
  await audit("recruiter", "interview_prepared", "application", applicationId);
  return { ok: true };
}

// ---------- AI ----------
function extractText(res: unknown): string {
  const r = res as { output_text?: string; output?: { type: string; content?: { type: string; text?: string }[] }[] };
  if (typeof r.output_text === "string" && r.output_text) return r.output_text;
  return (r.output ?? [])
    .filter((o) => o.type === "message")
    .flatMap((o) => o.content ?? [])
    .filter((c) => c.type === "output_text")
    .map((c) => c.text ?? "")
    .join("");
}

async function askJson<T>(system: string, user: string, name: string, schema: Record<string, unknown>, parser: z.ZodType<T>): Promise<T> {
  const res = await generateResponse({
    model: MODEL,
    input: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    text: { format: { type: "json_schema", name, schema, strict: true } },
  });
  return parser.parse(JSON.parse(extractText(res)));
}

const ETHICS = `Règles impératives :
- Tu assistes un recruteur ; tu ne prends AUCUNE décision et tu ne recommandes jamais de rejet.
- N'utilise jamais de caractéristiques protégées (âge, genre, origine, nationalité, religion, handicap, situation familiale, apparence, adresse, photo, nom) ni d'indices indirects de celles-ci.
- N'invente jamais de preuve. Une preuve ("evidence") doit être une citation ou paraphrase fidèle du texte fourni ; sinon statut "not_documented" et evidence vide.
- "source" indique la page du CV (ex: "CV, page 2") ou la réponse concernée.
- Réponds en français.`;

export async function runCvAnalysis(applicationId: string, webhookUrl = CV_ANALYSIS_WEBHOOK_URL) {
  const { data: app, error } = await supabaseAdmin
    .from("applications")
    .select("*, jobs(*)")
    .eq("id", applicationId)
    .single();
  if (error || !app) throw new Error("Candidature introuvable");
  const job = app.jobs;

  await supabaseAdmin.from("applications").update({ analysis_status: "extracting", analysis_error: null }).eq("id", applicationId);

  try {
    const pages = (app.cv_pages as string[] | null) ?? (app.cv_text ? [app.cv_text] : []);
    const cvText = pages.map((p, i) => `--- CV, page ${i + 1} ---\n${p}`).join("\n\n").slice(0, 60000);
    if (cvText.replace(/[-\sCVpage\d,]/g, "").length < 50) {
      throw new Error("Le texte du CV n'a pas pu être extrait (PDF scanné ou vide). Demandez un CV au format PDF texte.");
    }

    await supabaseAdmin.from("applications").update({ analysis_status: "analyzing" }).eq("id", applicationId);

    const { data: criteria } = await supabaseAdmin.from("job_criteria").select("*").eq("job_id", job.id).order("position");

    // CV analysis is delegated to n8n; it answers through the "cv-analysis-result" callback.
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json", "x-webhook-secret": readSecret("N8N_WEBHOOK_SECRET") ?? "", "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify({
        type: "cv_analysis_requested",
        application_id: applicationId,
        job: { id: job.id, title: job.title, description: job.description, missions: job.missions, skills: job.skills, experience: job.experience, diplomas: job.diplomas },
        criteria: (criteria ?? []).map((c) => ({ name: c.name, weight: c.weight, mandatory: c.mandatory })),
        cv_pages: pages,
      }),
    });
    if (!res.ok) throw new Error(res.status === 404 ? "Le webhook n8n d’analyse n’est pas actif (activez le workflow ET-02 dans n8n)." : `n8n a refusé l’analyse (${res.status}).`);
    // n8n may answer directly with the analysis, or later through the "cv-analysis-result" callback.
    const body = await res.json().catch(() => null);
    const direct = parseCvResult(body);
    if (direct) return saveCvAnalysis(applicationId, direct);
    return { ok: true as const };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue";
    await supabaseAdmin.from("applications").update({ analysis_status: "error", analysis_error: message }).eq("id", applicationId);
    await audit("n8n", "cv_analysis_failed", "application", applicationId, { message });
    return { ok: false as const, error: message };
  }
}


/** Persists an analysis produced by n8n. Scoring stays in the app. */
export async function saveCvAnalysis(applicationId: string, result: CvAnalysisView, source = "n8n") {
  const { data: app, error } = await supabaseAdmin.from("applications").select("id, job_id, jobs(title)").eq("id", applicationId).single();
  if (error || !app) throw new Error("Candidature introuvable");
  const { data: criteria } = await supabaseAdmin.from("job_criteria").select("*").eq("job_id", app.job_id).order("position");
  try {
    const score = (result.detail?.scoreGlobal ?? (result.detail ? computeCategoryScore(result.detail.categories) : null)) ?? computeMatchScore(criteria ?? [], result.criteria_analysis);

    await supabaseAdmin.from("cv_analyses").insert({
      application_id: applicationId,
      result: result as never,
      match_score: score,
      recommendation: result.interview_recommendation,
      confidence: result.confidence,
      model: source,
    });

    await supabaseAdmin
      .from("applications")
      .update({
        analysis_status: "done",
        match_score: score,
        recommendation: result.interview_recommendation,
        analysis_error: null,
      })
      .eq("id", applicationId);

    await audit("n8n", "cv_analyzed", "application", applicationId, { score });
    await notify("cv_analyzed", applicationId, { job_title: app.jobs?.title });
    return { ok: true as const };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue";
    await supabaseAdmin.from("applications").update({ analysis_status: "error", analysis_error: message }).eq("id", applicationId);
    await audit("ai", "cv_analysis_failed", "application", applicationId, { message });
    throw new Error(message);
  }
}

const interviewSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "strengths", "points_to_verify", "per_question"],
  properties: {
    summary: { type: "string" },
    strengths: { type: "array", items: { type: "string" } },
    points_to_verify: { type: "array", items: { type: "string" } },
    per_question: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question", "assessment"],
        properties: { question: { type: "string" }, assessment: { type: "string" } },
      },
    },
  },
};
const interviewParser = z.object({
  summary: z.string(),
  strengths: z.array(z.string()),
  points_to_verify: z.array(z.string()),
  per_question: z.array(z.object({ question: z.string(), assessment: z.string() })),
});

export async function runInterviewAnalysis(applicationId: string) {
  const { data: interview } = await supabaseAdmin.from("interviews").select("*").eq("application_id", applicationId).single();
  if (!interview) throw new Error("Pré-entretien introuvable");
  const { data: app } = await supabaseAdmin.from("applications").select("*, jobs(*)").eq("id", applicationId).single();
  if (!app) throw new Error("Candidature introuvable");

  await supabaseAdmin.from("interviews").update({ analysis_status: "analyzing" }).eq("id", interview.id);
  try {
    const qs = await getInterviewQuestions(app.job_id, applicationId);
    const { data: answers } = await supabaseAdmin.from("interview_answers").select("*").eq("interview_id", interview.id);
    const { data: criteria } = await supabaseAdmin.from("job_criteria").select("*").eq("job_id", app.job_id).order("position");
    const qa = qs
      .map((q, i) => `Q${i + 1}. ${q.question}\nRéponse : ${answers?.find((a) => a.question_id === q.id)?.answer_text || "(sans réponse)"}`)
      .join("\n\n");

    const summary = await askJson<InterviewSummary>(
      `Tu analyses un pré-entretien écrit asynchrone pour le Groupe Orvane.\n${ETHICS}\n- Analyse uniquement le contenu professionnel des réponses. Ne commente jamais le style d'écriture, l'orthographe, la voix, l'accent, les émotions ou l'apparence.`,
      `Poste : ${app.jobs.title}\nGrille d'évaluation : ${(criteria ?? []).map((c) => `${c.name} (${c.weight} %)`).join(", ")}\n\n${qa}\n\nProduis la synthèse JSON (une entrée per_question par question, dans l'ordre).`,
      "interview_analysis",
      interviewSchema,
      interviewParser,
    );

    await supabaseAdmin.from("interviews").update({ summary: summary as never, analysis_status: "done" }).eq("id", interview.id);
    if (app.status !== "decided") await supabaseAdmin.from("applications").update({ status: "to_review" }).eq("id", applicationId);
    await audit("ai", "interview_analyzed", "application", applicationId, { model: MODEL });
    await notify("recruiter_review_needed", applicationId, { job_title: app.jobs.title });
    return { ok: true as const };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue";
    await supabaseAdmin.from("interviews").update({ analysis_status: "error" }).eq("id", interview.id);
    if (app.status !== "decided") await supabaseAdmin.from("applications").update({ status: "interview_done" }).eq("id", applicationId);
    return { ok: false as const, error: message };
  }
}

export async function getInterviewQuestions(jobId: string, applicationId: string) {
  const { data: snapshot, error } = await supabaseAdmin.from("interview_questions").select("id, question, kind, position").eq("application_id", applicationId).order("position");
  if (error) throw new Error(error.message);
  if (snapshot?.some((q) => q.kind === "common")) return snapshot;
  const [{ data: common }, { data: personal }] = await Promise.all([
    supabaseAdmin.from("interview_questions").select("id, question, kind, position").eq("job_id", jobId).is("application_id", null).eq("kind", "common").order("position"),
    supabaseAdmin.from("interview_questions").select("id, question, kind, position").eq("application_id", applicationId).order("position"),
  ]);
  return [...(common ?? []), ...(personal ?? [])];
}

/** Creates (or reuses) candidate + application. Deduplicates on email per job. */
export async function createApplication(input: { jobId: string; fullName: string; email: string; phone?: string | null | undefined; source: string }) {
  const email = input.email.trim().toLowerCase();
  const { data: existing } = await supabaseAdmin.from("candidates").select("id").eq("email", email).maybeSingle();
  let candidateId = existing?.id;
  if (!candidateId) {
    const { data, error } = await supabaseAdmin
      .from("candidates")
      .insert({ full_name: input.fullName.trim(), email, phone: input.phone ?? null })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    candidateId = data.id;
  }
  const { data: dup } = await supabaseAdmin.from("applications").select("id").eq("job_id", input.jobId).eq("candidate_id", candidateId).maybeSingle();
  if (dup) return { applicationId: dup.id, duplicate: true };
  const { data: app, error } = await supabaseAdmin
    .from("applications")
    .insert({ job_id: input.jobId, candidate_id: candidateId, source: input.source })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await audit(input.source, "application_received", "application", app.id);
  return { applicationId: app.id, duplicate: false };
}

/** Stores a CV (base64) and its extracted page texts. */
export async function storeCv(applicationId: string, file: { name: string; base64: string; pages: string[] }) {
  const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0));
  if (bytes.byteLength > 10 * 1024 * 1024) throw new Error("Fichier trop volumineux (10 Mo max).");
  const path = `${applicationId}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
  const { error } = await supabaseAdmin.storage.from("cvs").upload(path, bytes, { contentType: "application/pdf" });
  if (error) throw new Error(error.message);
  await supabaseAdmin
    .from("applications")
    .update({ cv_path: path, cv_filename: file.name, cv_pages: file.pages as never, cv_text: file.pages.join("\n\n"), analysis_status: "pending" })
    .eq("id", applicationId);
}
