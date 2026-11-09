import { describe, expect, it } from "vitest";
import { cvAnalysisPayload, inlineCvResults, type CvAnalysisPayload, type CvAnalysisSource } from "./cv-analysis-request";

const job = { id: "job-1", title: "Responsable logistique", description: "d", missions: "m", skills: "s", experience: "e", diplomas: "di" };
const criteria = [{ name: "Management", weight: 60, mandatory: true }, { name: "WMS", weight: 40, mandatory: false }];

const app = (id: string, page: string): CvAnalysisSource => ({
  id,
  cv_pages: [page],
  cv_text: page,
  jobs: job,
});

const longText = "Gestionnaire d'entrepôt depuis huit ans, responsable de douze personnes, utilisateur quotidien d'un WMS interne.";

describe("objet candidature envoyé à n8n", () => {
  it("contient la candidature, l'offre, la grille et le CV par page", () => {
    const p = cvAnalysisPayload(app("a1", longText), criteria);
    expect(p.application_id).toBe("a1");
    expect(p.job.id).toBe("job-1");
    expect(p.criteria).toEqual([{ name: "Management", weight: 60, mandatory: true }, { name: "WMS", weight: 40, mandatory: false }]);
    expect(p.cv_pages).toEqual([longText]);
  });

  it("l'analyse en masse envoie un tableau d'objets candidature", () => {
    const body = JSON.stringify([cvAnalysisPayload(app("a1", longText), criteria), cvAnalysisPayload(app("a2", longText), criteria)]);
    const parsed = JSON.parse(body) as CvAnalysisPayload[];
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(2);
    expect(parsed.map((p) => p.application_id)).toEqual(["a1", "a2"]);
    const [first] = parsed;
    expect(Object.keys(first ?? {}).sort()).toEqual(["application_id", "criteria", "cv_pages", "job", "type"]);
  });

  it("refuse un CV sans texte exploitable", () => {
    expect(() => cvAnalysisPayload({ id: "a3", cv_pages: [], cv_text: "", jobs: job }, criteria)).toThrow(/texte du CV/);
  });
});

describe("réponse n8n reçue en direct", () => {
  const payloads = [
    cvAnalysisPayload(app("a1", longText), criteria),
    cvAnalysisPayload(app("a2", longText), criteria),
  ];

  it("associe chaque résultat à sa candidature par application_id", () => {
    const body = [{ application_id: "a2", correspondance_pourcentage: 80 }, { application_id: "a1", correspondance_pourcentage: 60 }];
    expect(inlineCvResults(body, payloads).map((r) => r.applicationId)).toEqual(["a2", "a1"]);
  });

  it("garde l'ordre de la requête quand n8n ne renvoie aucun identifiant", () => {
    const body = [{ correspondance_pourcentage: 60 }, { correspondance_pourcentage: 80 }];
    expect(inlineCvResults(body, payloads).map((r) => r.applicationId)).toEqual(["a1", "a2"]);
  });

  it("ne devine aucune association quand le nombre de résultats diffère", () => {
    expect(inlineCvResults([{ correspondance_pourcentage: 60 }], payloads)).toEqual([]);
  });
});
