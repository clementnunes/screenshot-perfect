// Shape of a CV analysis returned by n8n (browser-safe).
import { z } from "zod";
import { normalizeN8nAnalysis, type CvAnalysisView } from "./recruitment";

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

// ---- n8n "Orvane" analysis format (French keys, may arrive wrapped in an array) ----
const str = z.string().catch("");
const strArr = z.array(z.string()).catch([]);
const skill = z.object({ competence: str, statut: str, justification: str }).passthrough();
const category = z.object({ score: z.number(), poids_percent: z.number(), score_pondere: z.number().optional(), justification: str }).passthrough();

export const n8nCvParser = z.object({
  success: z.boolean().optional(),
  experience_professionnelle: z.unknown().optional(),
  correspondance_pourcentage: z.unknown().optional(),
  competences_identifiees: z.unknown().optional(),
  pre_entretien: z.object({ statut: str, questions: strArr }).partial().optional(),
  recommandation_ia: z.object({ niveau: str, synthese: str, points_forts: strArr, ecarts: strArr, informations_manquantes: strArr, points_a_verifier: strArr }).partial().optional(),
  analyse_complete: z.object({
    experience_professionnelle: z.object({ synthese: str, details: z.array(z.record(z.string(), z.unknown())).catch([]) }).partial().optional(),
    competences_identifiees: z.object({ techniques: z.array(skill).catch([]), manageriales: z.array(skill).catch([]), transversales: z.array(skill).catch([]) }).partial().optional(),
    correspondance_pourcentage: z.record(z.string(), z.unknown()).optional(),
  }).passthrough().optional(),
}).passthrough();

export type N8nCvAnalysis = z.infer<typeof n8nCvParser>;

export function unwrapN8n(body: unknown): unknown {
  let b = Array.isArray(body) ? body[0] : body;
  if (b && typeof b === "object" && "result" in b) b = (b as { result: unknown }).result;
  return Array.isArray(b) ? b[0] : b;
}

/** Accepts either the legacy English result or the n8n French format. */
export function parseCvResult(body: unknown): CvAnalysisView | null {
  const b = unwrapN8n(body);
  const legacy = cvAnalysisInput.shape.result.safeParse(b);
  if (legacy.success) return legacy.data;
  const fr = n8nCvParser.safeParse(b);
  if (fr.success && (fr.data.analyse_complete || fr.data.recommandation_ia)) return normalizeN8nAnalysis(fr.data);
  return null;
}
