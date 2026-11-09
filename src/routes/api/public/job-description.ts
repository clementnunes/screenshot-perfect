import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { JOB_DESCRIPTION_COLUMNS, jobDescriptionPayload } from "@/lib/job-description";
import { isAuthorizedWebhook } from "@/lib/webhook-auth";

// Read endpoint for n8n: GET (or POST) /api/public/job-description
// Auth: header "x-webhook-secret" must equal N8N_WEBHOOK_SECRET.
// Returns the eight job-description sections of the current job, nothing else.

const uuid = z.string().uuid();

async function read(request: Request) {
  if (!isAuthorizedWebhook(request)) return Response.json({ error: "unauthorized" }, { status: 401 });

  const jobId = new URL(request.url).searchParams.get("job_id");
  if (jobId && !uuid.safeParse(jobId).success) return Response.json({ error: "invalid job_id" }, { status: 400 });

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let query = supabaseAdmin
    .from("jobs")
    .select(JOB_DESCRIPTION_COLUMNS)
    .order("created_at")
    .limit(1);
  if (jobId) query = supabaseAdmin.from("jobs").select(JOB_DESCRIPTION_COLUMNS).eq("id", jobId).limit(1);

  const { data, error } = await query.maybeSingle();
  if (error) return Response.json({ error: "read failed" }, { status: 500 });
  if (!data) return Response.json({ error: "job not found" }, { status: 404 });

  return Response.json(jobDescriptionPayload(data));
}

export const Route = createFileRoute("/api/public/job-description")({
  server: {
    handlers: {
      GET: async ({ request }) => read(request),
      POST: async ({ request }) => read(request),
    },
  },
});
