import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { parseCvResult } from "./cv-contract";
import { analysisScore, analysisSkills, computeCategoryScore, levelToRecommendation, normalizeN8nAnalysis } from "./recruitment";

describe("n8n CV analysis format", () => {
  it("averages category scores when n8n sends no weights", () => {
    expect(computeCategoryScore([{ score: 60, weight: 0 }, { score: 35, weight: 0 }, { score: 50, weight: 0 }, { score: 40, weight: 0 }, { score: 25, weight: 0 }])).toBe(42);
  });
  it("reads accented keys and string skills from n8n", () => {
    const v = normalizeN8nAnalysis({ analyse_complete: {
      competences_identifiees: { "Compétences managériales": ["Encadrement"], techniques: [{ nom: "SAP EWM", statut: "DEMONTREE" }] },
      correspondance_pourcentage: { "competences_managériales": { score: 50, poids: 20 } },
    } });
    expect(analysisSkills(v)).toEqual(["SAP EWM", "Encadrement"]);
    expect(v.detail?.categories[0]).toMatchObject({ key: "competences_manageriales", score: 50, weight: 20 });
  });
  it("computes the weighted category score in the app", () => {
    expect(computeCategoryScore([{ score: 95, weight: 30 }, { score: 85, weight: 25 }, { score: 90, weight: 20 }, { score: 80, weight: 15 }, { score: 80, weight: 10 }])).toBe(88);
  });
  it("maps 'à approfondir' to review, never a rejection", () => {
    expect(levelToRecommendation("PROFIL_A_APPROFONDIR")).toBe("review");
    expect(levelToRecommendation("PROFIL_NON_RETENU")).toBe("verify");
  });
  const f = "/mnt/user-uploads/success_experience_professionnelle_pasted.json";
  it.runIf(existsSync(f))("parses the real n8n sample (array-wrapped)", () => {
    const r = parseCvResult(JSON.parse(readFileSync(f, "utf8")));
    expect(r?.detail?.categories).toHaveLength(5);
    expect(r?.detail?.skills.find((g) => g.group === "Techniques")?.items.length).toBe(6);
  });
});

describe("n8n flat schema (v2)", () => {
  const f2 = "/mnt/user-uploads/success_experience_professionnelle_pasted-2.json";
  it.runIf(existsSync(f2))("parses top-level experience object and null correspondance", () => {
    const r = parseCvResult(JSON.parse(readFileSync(f2, "utf8")));
    expect(r?.experience_summary).toBe("Informations professionnelles non disponibles.");
    expect(r?.missing_information).toHaveLength(5);
    expect(r?.interview_recommendation).toBe("verify");
  });
  it("reads top-level skills array", () => {
    const r = parseCvResult({ success: true, competences_identifiees: [{ competence: "CACES", statut: "DEMONTREE" }], recommandation_ia: { niveau: "X" } });
    expect(r && analysisSkills(r)).toEqual(["CACES"]);
  });
  it("hides skills not mentioned in the CV", () => {
    const r = normalizeN8nAnalysis({ analyse_complete: { competences_identifiees: {
      techniques: [
        { competence: "WMS", statut: "DEMONTREE" },
        { competence: "SAP EWM", statut: "NON_MENTIONNEE" },
        { competence: "Anglais", statut: "non mentionnée" },
      ],
    } } });
    expect(analysisSkills(r)).toEqual(["WMS"]);
  });
  it("uses a numeric correspondance_pourcentage as the match score", () => {
    const r = normalizeN8nAnalysis({ analyse_complete: { correspondance_pourcentage: 76 } });
    expect(r.detail?.scoreGlobal).toBe(76);
    expect(r.detail?.categories).toHaveLength(0);
    expect(analysisScore(r, null)).toBe(76);
  });
});
