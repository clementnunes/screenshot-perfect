// Shape of a CV analysis returned by n8n (browser-safe).
import { z } from "zod";

const statusEnum = ["documented", "partial", "not_documented", "contradictory", "to_verify"] as const;

export const cvParser = z.object({
  candidate_summary: z.string(),
  experience_summary: z.string(),
  skills: z.array(z.string()),
  criteria_analysis: z.array(z.object({ criterion: z.string(), status: z.enum(statusEnum), evidence: z.string(), source: z.string() })),
  missing_information: z.array(z.string()),
  interview_recommendation: z.enum(["invite_interview", "review", "verify"]),
  interview_questions: z.array(z.string()),
  interview_summary: z.null(),
  confidence: z.number().min(0).max(1),
});

export const cvAnalysisInput = z.object({
  application_id: z.string().uuid(),
  result: cvParser.extend({ interview_questions: z.array(z.string()).default([]), interview_summary: z.null().default(null) }),
});
