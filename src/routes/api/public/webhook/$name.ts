import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { parseCvResult } from "@/lib/cv-contract";
import { interviewAnswerInput, interviewQuestionsInput } from "@/lib/interview-contract";
import { isAuthorizedWebhook } from "@/lib/webhook-auth";

// n8n integration endpoints: POST /api/public/webhook/<name>
// Auth: header "x-webhook-secret" must equal N8N_WEBHOOK_SECRET.
// Deduplication: optional "idempotency-key" header; a replayed key returns the first result.

const schemas = {
  "candidate-received": z.object({ job_id: z.string().uuid(), full_name: z.string().min(2).max(120), email: z.string().email().max(255), phone: z.string().max(40).optional() }),
  "analyze-cv": z.object({ application_id: z.string().uuid() }),
  "cv-analysis-result": z.object({ application_id: z.string().uuid() }).passthrough(),
  "interview-submission": z.object({ application_id: z.string().uuid() }),
  "interview-summary": z.object({ application_id: z.string().uuid(), summary: z.object({ summary: z.string(), strengths: z.array(z.string()), points_to_verify: z.array(z.string()), per_question: z.array(z.object({ question: z.string(), assessment: z.string() })) }) }),
  "interview-completed": z.object({ application_id: z.string().uuid() }),
  "interview-prepared": z.object({ application_id: z.string().uuid(), questions: interviewQuestionsInput }),
  "interview-answer": interviewAnswerInput,
  "interview-invited": z.object({ application_id: z.string().uuid() }),
  "notify-recruiter": z.object({ application_id: z.string().uuid().optional(), message: z.string().min(1).max(2000) }),
  "recruitment-decision": z.object({ application_id: z.string().uuid() }),
} as const;

type Name = keyof typeof schemas;

export const Route = createFileRoute("/api/public/webhook/$name")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        if (!isAuthorizedWebhook(request)) return Response.json({ error: "unauthorized" }, { status: 401 });

        const name = params.name as Name;
        if (!(name in schemas)) return Response.json({ error: "unknown webhook" }, { status: 404 });

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "invalid json" }, { status: 400 });
        }
        const parsed = schemas[name].safeParse(body);
        if (!parsed.success) return Response.json({ error: "invalid payload", issues: parsed.error.issues }, { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const lib = await import("@/lib/recruitment.server");

        const key = request.headers.get("idempotency-key");
        if (key) {
          const { data: seen } = await supabaseAdmin.from("audit_logs").select("details").eq("idempotency_key", `${name}:${key}`).maybeSingle();
          if (seen) return Response.json({ duplicate: true, ...((seen.details as Record<string, unknown>) ?? {}) });
        }

        let result: Record<string, unknown>;
        switch (name) {
          case "candidate-received": {
            const d = parsed.data as z.infer<(typeof schemas)["candidate-received"]>;
            const { data: job } = await supabaseAdmin.from("jobs").select("id, link_validity_days").eq("id", d.job_id).maybeSingle();
            if (!job) return Response.json({ error: "job not found" }, { status: 404 });
            const { applicationId, duplicate } = await lib.createApplication({ jobId: job.id, fullName: d.full_name, email: d.email, phone: d.phone, source: "n8n" });
            const link = await lib.issueCandidateLink(applicationId, job.link_validity_days);
            const origin = new URL(request.url).origin;
            result = { application_id: applicationId, duplicate, candidate_url: `${origin}/candidat/${link.token}`, expires_at: link.expiresAt };
            break;
          }
          case "analyze-cv": {
            const d = parsed.data as { application_id: string };
            result = await lib.runCvAnalysis(d.application_id);
            break;
          }
          case "cv-analysis-result": {
            const d = parsed.data as { application_id: string; result?: unknown };
            const r = parseCvResult(d.result ?? d);
            if (!r) return Response.json({ error: "invalid analysis format" }, { status: 400 });
            result = await lib.saveCvAnalysis(d.application_id, r);
            break;
          }
          case "interview-submission": {
            const d = parsed.data as { application_id: string };
            const { data: iv } = await supabaseAdmin.from("interviews").select("id,status,completed_at,interview_answers(question_id,answer_text,updated_at)").eq("application_id", d.application_id).eq("status", "completed").maybeSingle();
            if (!iv) return Response.json({ error: "submitted interview required" }, { status: 409 });
            const { data: qs } = await supabaseAdmin.from("interview_questions").select("id,question,kind,position").eq("application_id", d.application_id).order("position");
            result = { interview_id: iv.id, submitted_at: iv.completed_at, questions: qs ?? [], answers: iv.interview_answers }; break;
          }
          case "interview-summary": {
            const d = parsed.data as z.infer<(typeof schemas)["interview-summary"]>;
            const saved = await supabaseAdmin.from("interviews").update({ summary: d.summary, analysis_status: "done" }).eq("application_id", d.application_id).eq("status", "completed").select("id").maybeSingle();
            if (saved.error) throw saved.error;
            if (!saved.data) return Response.json({ error: "submitted interview required" }, { status: 409 });
            await supabaseAdmin.from("applications").update({ status: "to_review" }).eq("id", d.application_id).neq("status", "decided");
            result = { ok: true }; break;
          }
          case "interview-completed": {
            const d = parsed.data as { application_id: string };
            const { data: app } = await supabaseAdmin.from("applications").select("job_id, status").eq("id", d.application_id).single();
            const { data: iv } = await supabaseAdmin.from("interviews").select("*").eq("application_id", d.application_id).single();
            if (!app || !iv) return Response.json({ error: "interview not found" }, { status: 404 });
            const questions = await lib.getInterviewQuestions(app.job_id, d.application_id);
            const { data: answers } = await supabaseAdmin.from("interview_answers").select("question_id, answer_text").eq("interview_id", iv.id);
            if (!questions.length || questions.some((q) => !answers?.some((a) => a.question_id === q.id && a.answer_text.trim()))) return Response.json({ error: "incomplete answers" }, { status: 409 });
            if (iv.status === "completed" && iv.analysis_status === "done") { result = { ok: true }; break; }
            const { error } = await supabaseAdmin.from("interviews").update({ status: "completed", completed_at: iv.completed_at ?? new Date().toISOString() }).eq("id", iv.id);
            if (error) throw new Error(error.message);
            if (app.status !== "decided") await supabaseAdmin.from("applications").update({ status: "interview_done" }).eq("id", d.application_id);
            await lib.notify("interview_summary_requested", d.application_id, { interview_id: iv.id });
            result = { ok: true };
            break;
          }
          case "interview-prepared": {
            const d = parsed.data as z.infer<(typeof schemas)["interview-prepared"]>;
            const { data: app } = await supabaseAdmin.from("applications").select("job_id, status").eq("id", d.application_id).single();
            if (!app) return Response.json({ error: "application not found" }, { status: 404 });
            const { data: iv } = await supabaseAdmin.from("interviews").select("status").eq("application_id", d.application_id).maybeSingle();
            if (app.status === "decided" || (iv && iv.status !== "not_started")) return Response.json({ error: "interview locked" }, { status: 409 });
            const { prepareExistingQuestions } = await import("@/lib/candidate-portal.server");
            await prepareExistingQuestions(d.application_id, app.job_id);
            result = { ok: true, questions: await lib.getInterviewQuestions(app.job_id, d.application_id) };
            break;

          }
          case "interview-invited": {
            const d = parsed.data as { application_id: string };
            const { data: app } = await supabaseAdmin.from("applications").select("job_id").eq("id", d.application_id).single();
            if (!app || !(await lib.getInterviewQuestions(app.job_id, d.application_id)).length) return Response.json({ error: "questions not ready" }, { status: 409 });
            const updated = await supabaseAdmin.from("applications").update({ status: "interview_pending" }).eq("id", d.application_id).neq("status", "decided");
            if (updated.error) throw new Error(updated.error.message);
            const invited = await supabaseAdmin.from("interviews").update({ invited_at: new Date().toISOString() }).eq("application_id", d.application_id);
            if (invited.error) throw invited.error;
            await lib.audit("n8n", "interview_invited", "application", d.application_id);
            result = { ok: true }; break;
          }
          case "interview-answer": {
            const d = parsed.data as z.infer<typeof interviewAnswerInput>;
            const { data: iv } = await supabaseAdmin.from("interviews").select("*").eq("application_id", d.application_id).single();
            const { data: app } = await supabaseAdmin.from("applications").select("job_id, identity_confirmed_at").eq("id", d.application_id).single();
            if (!iv || !app) return Response.json({ error: "interview not found" }, { status: 404 });
            if (!app.identity_confirmed_at || iv.status === "completed") return Response.json({ error: "interview locked" }, { status: 409 });
            const questions = await lib.getInterviewQuestions(app.job_id, d.application_id);
            if (!questions.some((q) => q.id === d.question_id)) return Response.json({ error: "unknown question" }, { status: 400 });
            const saved = await supabaseAdmin.rpc("save_portal_answer", { p_application: d.application_id, p_question: d.question_id, p_text: d.answer_text, p_index: d.next_index });
            if (saved.error) return Response.json({ error: saved.error.message }, { status: 409 });
            result = { ok: true }; break;
          }
          case "notify-recruiter": {
            const d = parsed.data as { application_id?: string; message: string };
            await supabaseAdmin.from("notifications").insert({ type: "n8n_message", application_id: d.application_id ?? null, payload: { message: d.message } });
            result = { ok: true };
            break;
          }
          case "recruitment-decision": {
            // Decisions are only made by recruiters in the app; n8n can read the latest one to send the answer.
            const d = parsed.data as { application_id: string };
            const { data: dec } = await supabaseAdmin
              .from("recruitment_decisions")
              .select("decision, comment, decided_by_email, created_at")
              .eq("application_id", d.application_id)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            result = { decision: dec ?? null };
            break;
          }
        }
        await supabaseAdmin.from("audit_logs").insert({ actor: "n8n", action: `webhook_${name}`, entity: "webhook", details: result as never, idempotency_key: key ? `${name}:${key}` : null });
        return Response.json(result);
      },
    },
  },
});
