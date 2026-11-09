import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { analysisInterviewQuestions, assembleInterviewQuestions, isActiveInvitation } from "./interview-contract";
import type { CvAnalysisView } from "./recruitment";

export async function candidateApplication(email: string) {
  const { data: candidate } = await supabaseAdmin.from("candidates").select("id").eq("email", email.trim().toLowerCase()).maybeSingle();
  if (!candidate) return null;
  const { data: apps, error } = await supabaseAdmin.from("applications").select("*, candidates(full_name,email), jobs(title,location,contract_type,confirmation_message), interviews(*)").eq("candidate_id", candidate.id).order("created_at", { ascending: false });
  if (error) throw error;
  return apps?.find((app) => isActiveInvitation(app, app.interviews)) ?? null;
}

export async function prepareExistingQuestions(applicationId: string, jobId: string) {
  const [{ data: common, error }, { data: analysis, error: analysisError }, { data: iv, error: interviewError }] = await Promise.all([
    supabaseAdmin.from("interview_questions").select("question").eq("job_id", jobId).is("application_id", null).eq("kind", "common").order("position"),
    supabaseAdmin.from("cv_analyses").select("result").eq("application_id", applicationId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabaseAdmin.from("interviews").select("status").eq("application_id", applicationId).maybeSingle(),
  ]);
  if (error) throw error;
  if (analysisError) throw analysisError;
  if (interviewError) throw interviewError;
  if (iv && iv.status !== "not_started") return;
  const result = analysis?.result as CvAnalysisView | undefined;
  const questions = assembleInterviewQuestions((common ?? []).map((q) => q.question), analysisInterviewQuestions(result));
  const prepared = await supabaseAdmin.rpc("prepare_portal_interview", { p_application: applicationId, p_questions: questions });
  if (prepared.error) throw prepared.error;
}

export async function provisionInvitedAccount(email: string) {
  const { error } = await supabaseAdmin.auth.admin.createUser({ email, email_confirm: true });
  if (error && error.code !== "email_exists" && error.code !== "user_already_exists") throw error;
}