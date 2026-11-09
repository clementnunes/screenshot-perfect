import { describe, expect, it } from "vitest";
import { computeMatchScore, matchesFilter, weightsAreValid } from "./recruitment";

const criteria = [
  { name: "Management", weight: 25 },
  { name: "Gestion logistique", weight: 25 },
  { name: "Gestion des stocks", weight: 20 },
  { name: "Maîtrise WMS", weight: 15 },
  { name: "Amélioration continue", weight: 15 },
];

describe("pondérations", () => {
  it("accepte une somme égale à 100 %", () => {
    expect(weightsAreValid(criteria)).toBe(true);
  });
  it("refuse une somme différente de 100 %", () => {
    expect(weightsAreValid([{ weight: 50 }, { weight: 40 }])).toBe(false);
  });
});

describe("correspondance", () => {
  it("ne compte que les preuves documentées en totalité, partielles à moitié", () => {
    const score = computeMatchScore(criteria, [
      { criterion: "Management", status: "documented" },
      { criterion: "Gestion logistique", status: "partial" },
      { criterion: "Gestion des stocks", status: "to_verify" },
    ]);
    expect(score).toBe(38); // 25 + 12.5
  });
});

describe("filtres", () => {
  it("une candidature décidée n'apparaît pas à analyser", () => {
    expect(matchesFilter({ status: "decided", analysis_status: "error" }, "to_analyze")).toBe(false);
  });
  it("un profil au-dessus du seuil apparaît en « pré-entretien à réaliser »", () => {
    expect(matchesFilter({ status: "new", analysis_status: "done", match_score: 76 }, "interview", 70)).toBe(true);
  });
  it("un profil sous le seuil n'y apparaît pas", () => {
    expect(matchesFilter({ status: "new", analysis_status: "done", match_score: 50 }, "interview", 70)).toBe(false);
  });
  it("un pré-entretien déjà terminé n'est plus à réaliser", () => {
    expect(matchesFilter({ status: "new", analysis_status: "done", match_score: 76, interviewStatus: "completed" }, "interview", 70)).toBe(false);
  });
});

describe("correspondance tolérante au libellé", () => {
  it("reconnaît un critère dont le libellé est suivi de précisions", () => {
    expect(computeMatchScore([{ name: "Management", weight: 100 }], [{ criterion: "Management (obligatoire, 25 %)", status: "documented" }])).toBe(100);
  });
});
