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

// ---- n8n detailed analysis (French format) ----
export interface N8nSkill { competence: string; statut: string; justification: string }
export interface N8nCategory { key: string; label: string; score: number; weight: number; justification: string }
export interface N8nDetail {
  experiences: { intitule_poste?: string; entreprise?: string; periode?: string; duree_exploitable?: string; responsabilites?: string[]; lien_aux_missions_du_poste?: string }[];
  skills: { group: string; items: N8nSkill[] }[];
  categories: N8nCategory[];
  limitations: string;
  level: string;
  strengths: string[];
  gaps: string[];
  to_verify: string[];
  suggested_questions: string[];
  interview_status: string;
}
export type CvAnalysisView = CvAnalysisResult & { detail?: N8nDetail };

const CATEGORY_LABEL: Record<string, string> = {
  experience_professionnelle: "Expérience professionnelle",
  competences_techniques: "Compétences techniques",
  competences_manageriales: "Compétences managériales",
  missions_et_responsabilites: "Missions et responsabilités",
  formation_et_qualifications: "Formation et qualifications",
};

/** Weighted score (0-100) from n8n category scores; recomputed by the app. */
export function computeCategoryScore(categories: { score: number; weight: number }[]): number | null {
  const total = categories.reduce((s, c) => s + c.weight, 0);
  if (!total) return null;
  return Math.round(categories.reduce((s, c) => s + c.score * c.weight, 0) / total);
}

/** Maps an n8n level (e.g. PROFIL_A_APPROFONDIR) to the app recommendation. Never a rejection. */
export function levelToRecommendation(level: string): Recommendation {
  const l = level.toUpperCase();
  if (l.includes("APPROFONDIR") || l.includes("EXAMINER")) return "review";
  if (l.includes("RECOMMANDE") || l.includes("FORT") || l.includes("INVITER") || l.includes("PRIORITAIRE")) return "invite_interview";
  return "verify";
}

type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export function normalizeN8nAnalysis(n: Loose): CvAnalysisView {
  const full: Loose = n.analyse_complete ?? {};
  const reco: Loose = n.recommandation_ia ?? {};
  const fullReco: Loose = full.recommendation_ia ?? {};
  const comp: Loose = full.competences_identifiees ?? {};
  const groups = [["Techniques", comp.techniques], ["Managériales", comp.manageriales], ["Transversales", comp.transversales]] as const;
  const skills = groups.map(([group, items]) => ({ group, items: ((items ?? []) as N8nSkill[]).filter((s) => s?.competence) }));
  const corr: Loose = full.correspondance_pourcentage ?? {};
  const categories: N8nCategory[] = Object.entries(corr)
    .filter(([, v]) => v && typeof v === "object" && typeof (v as Loose).score === "number")
    .map(([key, v]) => ({ key, label: CATEGORY_LABEL[key] ?? key.replace(/_/g, " "), score: (v as Loose).score, weight: Number((v as Loose).poids_percent) || 0, justification: String((v as Loose).justification ?? "") }));
  const level = String(reco.niveau ?? fullReco.niveau ?? "");
  const synthese = String(reco.synthese ?? fullReco.justification_niveau_recommandation ?? "").split("\n")[0] ?? "";
  const missing: string[] = reco.informations_manquantes ?? fullReco.informations_manquantes ?? [];
  const questions: string[] = n.pre_entretien?.questions ?? full.pre_entretien?.questions ?? [];
  return {
    candidate_summary: synthese,
    experience_summary: String(full.experience_professionnelle?.synthese ?? n.experience_professionnelle ?? "").split("\n")[0] ?? "",
    skills: skills.flatMap((g) => g.items.map((s) => s.competence)),
    criteria_analysis: [],
    missing_information: missing,
    interview_recommendation: levelToRecommendation(level),
    interview_questions: questions,
    interview_summary: null,
    confidence: 1,
    detail: {
      experiences: full.experience_professionnelle?.details ?? [],
      skills,
      categories,
      limitations: String(corr.limitations_evaluation ?? ""),
      level,
      strengths: reco.points_forts ?? fullReco.points_forts ?? [],
      gaps: reco.ecarts ?? fullReco.ecarts_par_rapport_a_la_fiche ?? [],
      to_verify: reco.points_a_verifier ?? fullReco.points_a_verifier_en_entretien ?? [],
      suggested_questions: questions,
      interview_status: String(n.pre_entretien?.statut ?? full.pre_entretien?.decision ?? ""),
    },
  };
}
