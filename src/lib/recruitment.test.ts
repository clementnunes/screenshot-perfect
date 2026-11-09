import { describe, expect, it } from "vitest";
import { computeMatchScore, dashboardRecommendation, decisionCellLabel, latestDecision, matchesFilter, weightsAreValid } from "./recruitment";

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

describe("recommandation affichée dans le tableau", () => {
  it("« À examiner » quand la correspondance dépasse 50 % et que le pré-entretien est terminé", () => {
    expect(dashboardRecommendation(null, 76, "completed")).toBe("review");
    expect(dashboardRecommendation("invite_interview", 51, "completed")).toBe("review");
  });
  it("jamais « À examiner » si le pré-entretien n'est pas terminé", () => {
    expect(dashboardRecommendation("review", 76, undefined)).toBe(null);
    expect(dashboardRecommendation("review", 76, "in_progress")).toBe(null);
  });
  it("jamais « À examiner » si la correspondance n'atteint pas 50 %", () => {
    expect(dashboardRecommendation("review", 50, "completed")).toBe(null);
    expect(dashboardRecommendation("review", 43, "completed")).toBe(null);
    expect(dashboardRecommendation("review", null, "completed")).toBe(null);
  });
  it("les autres recommandations de l'IA restent visibles", () => {
    expect(dashboardRecommendation("invite_interview", 76, undefined)).toBe("invite_interview");
    expect(dashboardRecommendation("verify", 43, undefined)).toBe("verify");
  });
  it("jamais « Vérification nécessaire » en dessous du seuil de correspondance", () => {
    expect(dashboardRecommendation("verify", 19, undefined, 50)).toBe(null);
    expect(dashboardRecommendation("verify", 50, undefined, 50)).toBe(null);
    expect(dashboardRecommendation("verify", null, undefined, 50)).toBe(null);
  });
  it("« Vérification nécessaire » conservée au-delà du seuil", () => {
    expect(dashboardRecommendation("verify", 78, undefined, 50)).toBe("verify");
    expect(dashboardRecommendation("verify", 78, "in_progress", 50)).toBe("verify");
  });
});

describe("correspondance tolérante au libellé", () => {
  it("reconnaît un critère dont le libellé est suivi de précisions", () => {
    expect(computeMatchScore([{ name: "Management", weight: 100 }], [{ criterion: "Management (obligatoire, 25 %)", status: "documented" }])).toBe(100);
  });
});

describe("décision affichée dans le tableau", () => {
  it("désigne la dernière décision enregistrée", () => {
    expect(latestDecision([
      { decision: "reject", created_at: "2026-01-02T10:00:00Z" },
      { decision: "invite_meeting", created_at: "2026-01-05T09:00:00Z" },
    ])).toBe("invite_meeting");
    expect(latestDecision([])).toBe(null);
    expect(latestDecision(undefined)).toBe(null);
  });
  it("« Décision prise : RDV » après une invitation à un rendez-vous", () => {
    expect(decisionCellLabel("invite_meeting")).toBe("Décision prise : RDV");
  });
  it("« Décision prise : refus » après un refus", () => {
    expect(decisionCellLabel("reject")).toBe("Décision prise : refus");
  });
  it("« Décision prise : vérification » après une vérification complémentaire", () => {
    expect(decisionCellLabel("request_verification")).toBe("Décision prise : vérification");
  });
  it("reste « Décision prise » sans décision connue", () => {
    expect(decisionCellLabel(null)).toBe("Décision prise");
    expect(decisionCellLabel("autre_chose")).toBe("Décision prise");
  });
});
