// Shared, browser-safe recruitment rules and labels.

export type CriterionStatus = "documented" | "partial" | "not_documented" | "contradictory" | "to_verify";
export type Recommendation = "invite_interview" | "review" | "verify";

export interface CriterionAnalysis {
  criterion: string;
  status: CriterionStatus;
  evidence: string;
  source: string;
}

export interface CvAnalysisResult {
  candidate_summary: string;
  experience_summary: string;
  skills: string[];
  criteria_analysis: CriterionAnalysis[];
  missing_information: string[];
  interview_recommendation: Recommendation;
  interview_questions: string[];
  interview_summary: string | null;
  confidence: number;
}

export interface InterviewSummary {
  summary: string;
  strengths: string[];
  points_to_verify: string[];
  per_question: { question: string; assessment: string }[];
}

export const CRITERION_STATUS_LABEL: Record<CriterionStatus, string> = {
  documented: "Documenté",
  partial: "Partiel",
  not_documented: "Non documenté",
  contradictory: "Contradictoire",
  to_verify: "À vérifier",
};

export const RECOMMENDATION_LABEL: Record<string, string> = {
  invite_interview: "Pré-entretien recommandé",
  review: "À examiner",
  verify: "Vérification nécessaire",
};

export const ANALYSIS_STEPS = [
  { key: "pending", label: "En attente" },
  { key: "extracting", label: "Extraction du CV" },
  { key: "analyzing", label: "Analyse des compétences" },
  { key: "done", label: "Analyse terminée" },
] as const;

export const ANALYSIS_LABEL: Record<string, string> = {
  pending: "En attente",
  extracting: "Extraction du CV",
  analyzing: "Analyse des compétences",
  done: "Analyse terminée",
  error: "Erreur à traiter",
};

export const INTERVIEW_LABEL: Record<string, string> = {
  none: "Non démarré",
  not_started: "À réaliser",
  in_progress: "En cours",
  completed: "Terminé",
};

export const DECISION_LABEL: Record<string, string> = {
  invite_meeting: "Invitation à un rendez-vous",
  request_verification: "Vérification complémentaire",
  reject: "Candidature refusée",
};

export type DashboardFilter = "all" | "to_analyze" | "interview" | "to_review" | "decided";

export const FILTERS: { key: DashboardFilter; label: string }[] = [
  { key: "all", label: "Tous" },
  { key: "to_analyze", label: "À analyser" },
  { key: "interview", label: "Pré-entretien à réaliser" },
  { key: "to_review", label: "À examiner" },
  { key: "decided", label: "Décision prise" },
];

export function matchesFilter(
  app: { status: string; analysis_status: string },
  filter: DashboardFilter,
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "to_analyze":
      return app.status !== "decided" && app.analysis_status !== "done";
    case "interview":
      return app.status === "interview_pending";
    case "to_review":
      return app.status === "to_review" || app.status === "interview_done";
    case "decided":
      return app.status === "decided";
  }
}

/** Points per criterion status: only documented evidence counts fully. */
const STATUS_POINTS: Record<CriterionStatus, number> = {
  documented: 1,
  partial: 0.5,
  to_verify: 0,
  not_documented: 0,
  contradictory: 0,
};

/** Weighted match (0-100) between the job criteria and the CV evidence. */
export function computeMatchScore(
  criteria: { name: string; weight: number }[],
  analysis: { criterion: string; status: CriterionStatus }[],
): number {
  const total = criteria.reduce((s, c) => s + c.weight, 0);
  if (total === 0) return 0;
  const norm = (v: string) => v.trim().toLowerCase();
  let points = 0;
  for (const c of criteria) {
    const found =
      analysis.find((a) => norm(a.criterion) === norm(c.name)) ??
      analysis.find((a) => norm(a.criterion).startsWith(norm(c.name)));
    points += c.weight * (found ? STATUS_POINTS[found.status] ?? 0 : 0);
  }
  return Math.round((points / total) * 100);
}

export function weightsTotal(criteria: { weight: number }[]): number {
  return criteria.reduce((s, c) => s + (Number.isFinite(c.weight) ? c.weight : 0), 0);
}

export function weightsAreValid(criteria: { weight: number }[]): boolean {
  return criteria.length > 0 && weightsTotal(criteria) === 100;
}

/** Common questions asked to every candidate. */
export const COMMON_QUESTION_COUNT = 4;
/** Questions generated from each CV. */
export const PERSONALIZED_QUESTION_COUNT = 2;
