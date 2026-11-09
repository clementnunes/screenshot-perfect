import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { cvAnalysisInput } from "@/lib/cv-contract";
import { interviewAnswerInput, interviewQuestionsInput } from "@/lib/interview-contract";
import { isAuthorizedWebhook } from "@/lib/webhook-auth";

// n8n integration endpoints: POST /api/public/webhook/<name>
// Auth: header "x-webhook-secret" must equal N8N_WEBHOOK_SECRET.
// Deduplication: optional "idempotency-key" header; a replayed key returns the first result.

const schemas = {
  "candidate-received": z.object({ job_id: z.string().uuid(), full_name: z.string().min(2).max(120), email: z.string().email().max(255), phone: z.string().max(40).optional() }),
  "analyze-cv": z.object({ application_id: z.string().uuid() }),
  "cv-analysis-result": cvAnalysisInput,
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
            const d = parsed.data as z.infer<typeof cvAnalysisInput>;
            result = await lib.saveCvAnalysis(d.application_id, d.result);
            break;
          }
          case "interview-completed": {
            const d = parsed.data as { application_id: string };
            const { data: app } = await supabaseAdmin.from("applications").select("job_id, status").eq("id", d.application_id).single();
            const { data: iv } = await supabaseAdmin.from("interviews").select("*").eq("application_id", d.application_id).single();
            if (!app || !iv) return Response.json({ error: "interview not found" }, { status: 404 });
            const questions = await lib.getInterviewQuestions(app.job_id, d.application_id);
            const { data: answers } = await supabaseAdmin.from("interview_answers").select("question_id, answer_text").eq("interview_id", iv.id);
            if (questions.length !== 6 || questions.some((q) => !answers?.some((a) => a.question_id === q.id && a.answer_text.trim()))) return Response.json({ error: "incomplete answers" }, { status: 409 });
            if (iv.status === "completed" && iv.analysis_status === "done") { result = { ok: true }; break; }
            const { error } = await supabaseAdmin.from("interviews").update({ status: "completed", completed_at: iv.completed_at ?? new Date().toISOString() }).eq("id", iv.id);
            if (error) throw new Error(error.message);
            if (app.status !== "decided") await supabaseAdmin.from("applications").update({ status: "interview_done" }).eq("id", d.application_id);
            result = await lib.runInterviewAnalysis(d.application_id);
            break;
          }
          case "interview-prepared": {
            const d = parsed.data as z.infer<(typeof schemas)["interview-prepared"]>;
            const { data: app } = await supabaseAdmin.from("applications").select("job_id, status").eq("id", d.application_id).single();
            if (!app) return Response.json({ error: "application not found" }, { status: 404 });
            const { data: iv } = await supabaseAdmin.from("interviews").select("status").eq("application_id", d.application_id).maybeSingle();
            if (app.status === "decided" || (iv && iv.status !== "not_started")) return Response.json({ error: "interview locked" }, { status: 409 });
            const ordered = [...d.questions.filter((q) => q.kind === "common"), ...d.questions.filter((q) => q.kind === "personalized")];
            const old = await supabaseAdmin.from("interview_questions").delete().eq("application_id", d.application_id);
            if (old.error) throw new Error(old.error.message);
            const inserted = await supabaseAdmin.from("interview_questions").insert(ordered.map((q, position) => ({ ...q, position, job_id: app.job_id, application_id: d.application_id }))).select("id, question, kind, position");
            if (inserted.error) throw new Error(inserted.error.message);
            if (!iv) {
              const created = await supabaseAdmin.from("interviews").insert({ application_id: d.application_id });
              if (created.error) throw new Error(created.error.message);
            }
            result = { ok: true, questions: inserted.data };
            break;
          }
          case "interview-invited": {
            const d = parsed.data as { application_id: string };
            const { data: app } = await supabaseAdmin.from("applications").select("job_id").eq("id", d.application_id).single();
            if (!app || (await lib.getInterviewQuestions(app.job_id, d.application_id)).length !== 6) return Response.json({ error: "questions not ready" }, { status: 409 });
            const updated = await supabaseAdmin.from("applications").update({ status: "interview_pending" }).eq("id", d.application_id).neq("status", "decided");
            if (updated.error) throw new Error(updated.error.message);
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
            const saved = await supabaseAdmin.from("interview_answers").upsert({ interview_id: iv.id, question_id: d.question_id, answer_text: d.answer_text, input_mode: d.input_mode, updated_at: new Date().toISOString() }, { onConflict: "interview_id,question_id" });
            if (saved.error) throw new Error(saved.error.message);
            const updated = await supabaseAdmin.from("interviews").update({ status: "in_progress", current_index: d.next_index, started_at: iv.started_at ?? new Date().toISOString() }).eq("id", iv.id).neq("status", "completed");
            if (updated.error) throw new Error(updated.error.message);
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
