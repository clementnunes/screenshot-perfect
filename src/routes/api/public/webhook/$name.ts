import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

// n8n integration endpoints: POST /api/public/webhook/<name>
// Auth: header "x-webhook-secret" must equal N8N_WEBHOOK_SECRET.
// Deduplication: optional "idempotency-key" header; a replayed key returns the first result.

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

const schemas = {
  "candidate-received": z.object({ job_id: z.string().uuid(), full_name: z.string().min(2).max(120), email: z.string().email().max(255), phone: z.string().max(40).optional() }),
  "analyze-cv": z.object({ application_id: z.string().uuid() }),
  "interview-completed": z.object({ application_id: z.string().uuid() }),
  "notify-recruiter": z.object({ application_id: z.string().uuid().optional(), message: z.string().min(1).max(2000) }),
  "recruitment-decision": z.object({ application_id: z.string().uuid() }),
} as const;

type Name = keyof typeof schemas;

export const Route = createFileRoute("/api/public/webhook/$name")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const secret = process.env["N8N_WEBHOOK_SECRET"];
        const given = request.headers.get("x-webhook-secret") ?? "";
        if (!secret || !safeEqual(given, secret)) return Response.json({ error: "unauthorized" }, { status: 401 });

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
          case "interview-completed": {
            const d = parsed.data as { application_id: string };
            result = await lib.runInterviewAnalysis(d.application_id);
            break;
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
