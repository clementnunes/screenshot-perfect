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
  /** Global match percentage sent by n8n (correspondance_pourcentage as a plain number). */
  scoreGlobal?: number | null;
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
  missions_responsabilites: "Missions et responsabilités",
  formation_qualifications: "Formation et qualifications",
  formation_et_qualifications: "Formation et qualifications",
};

/** Weighted score (0-100) from n8n category scores; recomputed by the app. */
export function computeCategoryScore(categories: { score: number; weight: number }[]): number | null {
  if (!categories.length) return null;
  const total = categories.reduce((s, c) => s + c.weight, 0);
  // n8n sent no weights: fall back to a plain average so the table still shows a match.
  if (!total) return Math.round(categories.reduce((s, c) => s + c.score, 0) / categories.length);
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

/** Normalises n8n keys: lowercase, no accents, underscores ("compétences managériales" -> "competences_manageriales"). */
const normKey = (k: string) => k.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
function pick(o: Loose, ...names: string[]): Loose {
  if (!o || typeof o !== "object") return undefined;
  const wanted = names.map(normKey);
  for (const [k, v] of Object.entries(o)) if (wanted.includes(normKey(k))) return v;
  return undefined;
}
/** True when the skill is actually mentioned in the CV; "non mentionnée"/absent skills are hidden. */
export function isSkillMentioned(s: N8nSkill): boolean {
  const st = normKey(s.statut || "");
  if (!st) return true;
  return !st.includes("non_mentionnee") && !st.includes("absente") && !st.includes("non_presente") && !st.includes("non_demontree");
}
function toSkill(s: Loose): N8nSkill | null {
  if (typeof s === "string") return s.trim() ? { competence: s.trim(), statut: "", justification: "" } : null;
  const name = pick(s, "competence", "nom", "name", "skill", "libelle", "intitule");
  if (!name) return null;
  const skill = { competence: String(name), statut: String(pick(s, "statut", "status", "niveau") ?? ""), justification: String(pick(s, "justification", "preuve", "evidence") ?? "") };
  return isSkillMentioned(skill) ? skill : null;
}
const SKILL_GROUPS: [string, string[]][] = [
  ["Techniques", ["techniques", "competences_techniques", "technique"]],
  ["Managériales", ["manageriales", "competences_manageriales", "manageriale", "management"]],
  ["Transversales", ["transversales", "competences_transversales", "transversale", "soft_skills"]],
];

export function normalizeN8nAnalysis(n: Loose): CvAnalysisView {
  const full: Loose = n.analyse_complete ?? {};
  const reco: Loose = n.recommandation_ia ?? {};
  const fullReco: Loose = full.recommendation_ia ?? {};
  const comp: Loose = pick(full, "competences_identifiees", "competences") ?? pick(n, "competences_identifiees", "competences") ?? {};
  const skills = Array.isArray(comp)
    ? [{ group: "Compétences", items: comp.map(toSkill).filter((x): x is N8nSkill => !!x) }]
    : SKILL_GROUPS.map(([group, keys]) => ({ group, items: ((pick(comp, ...keys) ?? []) as Loose[]).map(toSkill).filter((x): x is N8nSkill => !!x) }));
  const corr: Loose = pick(full, "correspondance_pourcentage", "correspondance") ?? pick(n, "correspondance_pourcentage", "correspondance") ?? {};
  // n8n may send a plain percentage (76) instead of per-category scores.
  const asPct = (v: unknown) => (typeof v === "number" || (typeof v === "string" && v.trim() !== "")) && Number.isFinite(parseFloat(String(v))) ? Math.round(parseFloat(String(v))) : null;
  const scoreGlobal = asPct(corr) ?? (corr && typeof corr === "object" && Object.keys(corr).length ? null : asPct(pick(n, "correspondance_pourcentage", "correspondance")) ?? asPct(pick(reco, "correspondance_pourcentage", "score")) ?? null);
  const categories: N8nCategory[] = Object.entries(scoreGlobal !== null ? {} : corr)
    .filter(([, v]) => v && typeof v === "object" && Number.isFinite(Number(pick(v, "score"))))
    .map(([raw, v]) => {
      const key = normKey(raw);
      return { key, label: CATEGORY_LABEL[key] ?? CATEGORY_LABEL[key.replace(/_et_/g, "_")] ?? raw.replace(/_/g, " "), score: Number(pick(v, "score")), weight: Number(pick(v, "poids_percent", "poids", "weight", "ponderation")) || 0, justification: String(pick(v, "justification") ?? "") };
    });
  const level = String(reco.niveau ?? fullReco.niveau ?? "");
  const synthese = String(reco.synthese ?? fullReco.justification_niveau_recommandation ?? "").split("\n")[0] ?? "";
  const missing: string[] = reco.informations_manquantes ?? fullReco.informations_manquantes ?? [];
  const questions: string[] = n.pre_entretien?.questions ?? full.pre_entretien?.questions ?? [];
  return {
    candidate_summary: synthese,
    experience_summary: String(full.experience_professionnelle?.synthese ?? n.experience_professionnelle?.synthese ?? (typeof n.experience_professionnelle === "string" ? n.experience_professionnelle : "")).split("\n")[0] ?? "",
    skills: skills.flatMap((g) => g.items.map((s) => s.competence)),
    criteria_analysis: [],
    missing_information: missing,
    interview_recommendation: levelToRecommendation(level),
    interview_questions: questions,
    interview_summary: null,
    confidence: 1,
    detail: {
      experiences: full.experience_professionnelle?.details ?? n.experience_professionnelle?.experiences ?? n.experience_professionnelle?.details ?? [],
      skills,
      categories,
      scoreGlobal,
      limitations: String((scoreGlobal !== null ? "" : corr.limitations_evaluation) ?? ""),
      level,
      strengths: reco.points_forts ?? fullReco.points_forts ?? [],
      gaps: reco.ecarts ?? fullReco.ecarts_par_rapport_a_la_fiche ?? [],
      to_verify: reco.points_a_verifier ?? fullReco.points_a_verifier_en_entretien ?? [],
      suggested_questions: questions,
      interview_status: String(n.pre_entretien?.statut ?? full.pre_entretien?.decision ?? ""),
    },
  };
}

/** Skill names to show in the dashboard, preferring the detailed n8n groups; non-mentioned skills are hidden. */
export function analysisSkills(a: CvAnalysisView | undefined): string[] {
  if (!a) return [];
  const fromDetail = (a.detail?.skills ?? []).flatMap((g) => g.items.filter(isSkillMentioned).map((s) => s.competence)).filter(Boolean);
  return fromDetail.length ? fromDetail : a.skills ?? [];
}

/** Match score to show: n8n global percentage first, then category average, else the stored score. */
export function analysisScore(a: CvAnalysisView | undefined, stored: number | null): number | null {
  if (!a?.detail) return stored;
  if (a.detail.scoreGlobal != null) return a.detail.scoreGlobal;
  return computeCategoryScore(a.detail.categories) ?? stored;
}


/** A profile whose match score is strictly above the job's global threshold should take the pre-interview. */
export function requiresInterview(score: number | null | undefined, threshold: number | null | undefined): boolean {
  if (score == null || threshold == null || !Number.isFinite(score)) return false;
  return score > threshold;
}
