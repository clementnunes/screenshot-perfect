import { z } from "zod";

export const interviewQuestionsInput = z.array(z.object({
  question: z.string().trim().min(1).max(2000),
  kind: z.enum(["common", "personalized"]),
})).min(1);

export function assembleInterviewQuestions(common: string[], personalized: string[]) {
  const seen = new Set<string>();
  return [...common.map((question) => ({ question, kind: "common" as const })), ...personalized.map((question) => ({ question, kind: "personalized" as const }))].filter(({ question }) => {
    const key = question.trim().replace(/\s+/g, " ").toLocaleLowerCase("fr");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function analysisInterviewQuestions(result: { interview_questions?: string[]; detail?: { suggested_questions?: string[] } } | null | undefined) {
  return assembleInterviewQuestions([], [...(result?.interview_questions ?? []), ...(result?.detail?.suggested_questions ?? [])]).map((q) => q.question);
}

export function canSubmitInterview(questions: { id: string }[], answers: { question_id: string; answer_text: string }[]) {
  return questions.length > 0 && questions.every((q) => answers.some((a) => a.question_id === q.id && a.answer_text.trim().length > 0));
}

export function isActiveInvitation(app: { token_revoked: boolean; token_expires_at: string | null }, interview: { invited_at: string | null } | null, now = Date.now()) {
  return !!interview?.invited_at && !app.token_revoked && !!app.token_expires_at && Date.parse(app.token_expires_at) > now;
}

export function canAccessByLink(app: { token_revoked: boolean; token_expires_at: string | null }, candidateEmail: string, enteredEmail: string, now = Date.now()) {
  return !app.token_revoked && !!app.token_expires_at && Date.parse(app.token_expires_at) > now && candidateEmail.trim().toLowerCase() === enteredEmail.trim().toLowerCase();
}

export const interviewAnswerInput = z.object({
  application_id: z.string().uuid(), question_id: z.string().uuid(),
  answer_text: z.string().max(5000), input_mode: z.enum(["text", "voice"]),
  next_index: z.number().int().min(0),
});