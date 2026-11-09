import { z } from "zod";
import { COMMON_QUESTION_COUNT, PERSONALIZED_QUESTION_COUNT } from "./recruitment";

export const interviewQuestionsInput = z.array(z.object({
  question: z.string().trim().min(1).max(2000),
  kind: z.enum(["common", "personalized"]),
})).length(COMMON_QUESTION_COUNT + PERSONALIZED_QUESTION_COUNT).refine(
  (qs) => qs.filter((q) => q.kind === "common").length === COMMON_QUESTION_COUNT && qs.filter((q) => q.kind === "personalized").length === PERSONALIZED_QUESTION_COUNT,
  "Le pré-entretien doit contenir quatre questions communes et deux personnalisées.",
);

export const interviewAnswerInput = z.object({
  application_id: z.string().uuid(), question_id: z.string().uuid(),
  answer_text: z.string().max(5000), input_mode: z.enum(["text", "voice"]),
  next_index: z.number().int().min(0).max(5),
});