// Browser-safe: the exact "candidature" object n8n receives for a CV analysis.
// Kept out of recruitment.server.ts so the contract can be tested without a backend.

export type CvJobSnapshot = {
  id: string;
  title: string;
  description: string | null;
  missions: string | null;
  skills: string | null;
  experience: string | null;
  diplomas: string | null;
};

/** Minimal shape of an `applications` row joined with its job, needed to build an n8n request. */
export type CvAnalysisSource = {
  id: string;
  cv_pages: string[] | null;
  cv_text: string | null;
  jobs: CvJobSnapshot;
};

export type CvCriterion = { name: string; weight: number; mandatory: boolean };

export type CvAnalysisPayload = {
  type: "cv_analysis_requested";
  application_id: string;
  job: { id: string; title: string; description: string | null; missions: string | null; skills: string | null; experience: string | null; diplomas: string | null };
  criteria: { name: string; weight: number; mandatory: boolean }[];
  cv_pages: string[];
};

/**
 * The "candidature" object n8n analyses: job, evaluation grid, CV text by page.
 * Throws when the CV has no usable text (scanned or empty PDF).
 */
export function cvAnalysisPayload(app: CvAnalysisSource, criteria: readonly CvCriterion[]): CvAnalysisPayload {
  const pages = app.cv_pages ?? (app.cv_text ? [app.cv_text] : []);
  const cvText = pages.map((p, i) => `--- CV, page ${i + 1} ---\n${p}`).join("\n\n").slice(0, 60000);
  if (cvText.replace(/[-\sCVpage\d,]/g, "").length < 50) {
    throw new Error("Le texte du CV n'a pas pu être extrait (PDF scanné ou vide). Demandez un CV au format PDF texte.");
  }
  const job = app.jobs;
  return {
    type: "cv_analysis_requested",
    application_id: app.id,
    job: { id: job.id, title: job.title, description: job.description, missions: job.missions, skills: job.skills, experience: job.experience, diplomas: job.diplomas },
    criteria: criteria.map((c) => ({ name: c.name, weight: c.weight, mandatory: c.mandatory })),
    cv_pages: pages,
  };
}

/** Results n8n answered inline: one per candidature, matched by application_id, otherwise by order. */
export function inlineCvResults(body: unknown, payloads: readonly CvAnalysisPayload[]) {
  const items: unknown[] = Array.isArray(body) ? body : body ? [body] : [];
  const out: { applicationId: string; result: unknown }[] = [];
  const withId = items.filter((i) => !!i && typeof i === "object" && typeof (i as Record<string, unknown>)["application_id"] === "string");
  if (withId.length) {
    for (const i of withId) out.push({ applicationId: (i as { application_id: string }).application_id, result: i });
    return out;
  }
  // No id in the answer: keep the request order, which is how n8n returns a batch.
  if (items.length === payloads.length) {
    items.forEach((i, idx) => {
      const p = payloads[idx];
      if (p) out.push({ applicationId: p.application_id, result: i });
    });
  }
  return out;
}
