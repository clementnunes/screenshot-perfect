import { describe, expect, it } from "vitest";
import { extractInterviewSummary, hasInterviewSummary, isSummaryGenerating } from "./interview-summary";

describe("extractInterviewSummary", () => {
  it("reads the synthesis at synthese_globale.resume", () => {
    const r = extractInterviewSummary({
      application_id: "x",
      synthese_globale: { resume: "Profil solide en pilotage d'entrepôt." },
    });
    expect(r?.summary).toBe("Profil solide en pilotage d'entrepôt.");
  });

  it("reads the flat resume n8n actually returns", () => {
    const r = extractInterviewSummary({ resume: "Aucune compétence confirmée." });
    expect(r?.summary).toBe("Aucune compétence confirmée.");
  });

  it("reads a synthesis nested under result", () => {
    const r = extractInterviewSummary({ result: { synthese_globale: { resume: "Bon candidat." } } });
    expect(r?.summary).toBe("Bon candidat.");
  });

  it("keeps strengths and points to verify when n8n sends them", () => {
    const r = extractInterviewSummary({
      synthese_globale: {
        resume: "Synthèse.",
        points_forts: ["Management d'équipe"],
        points_a_verifier: ["Disponibilité"],
        per_question: [{ question: "Pourquoi ce poste ?", analyse: "Réponse courte." }],
      },
    });
    expect(r?.strengths).toEqual(["Management d'équipe"]);
    expect(r?.points_to_verify).toEqual(["Disponibilité"]);
    expect(r?.per_question).toEqual([{ question: "Pourquoi ce poste ?", assessment: "Réponse courte." }]);
  });

  it("still accepts the app's own summary format", () => {
    const r = extractInterviewSummary({ summary: { summary: "Rédigée par l'app.", strengths: [], points_to_verify: [], per_question: [] } });
    expect(r?.summary).toBe("Rédigée par l'app.");
  });

  it("returns null when no synthesis is present", () => {
    expect(extractInterviewSummary({ application_id: "x" })).toBeNull();
    expect(extractInterviewSummary({ synthese_globale: { resume: "   " } })).toBeNull();
    expect(hasInterviewSummary({ resume: "" })).toBe(false);
    expect(hasInterviewSummary({ synthese_globale: { resume: "OK" } })).toBe(true);
  });
});

describe("isSummaryGenerating", () => {
  const now = Date.parse("2026-11-09T14:42:00.000Z");
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it("counts as generating only while the n8n run is recent", () => {
    expect(isSummaryGenerating("analyzing", ago(30_000), now)).toBe(true);
    expect(isSummaryGenerating("analyzing", ago(4 * 60_000), now)).toBe(false);
  });

  it("is not generating for any other status or a missing timestamp", () => {
    expect(isSummaryGenerating("done", ago(10_000), now)).toBe(false);
    expect(isSummaryGenerating("pending", ago(10_000), now)).toBe(false);
    expect(isSummaryGenerating("analyzing", null, now)).toBe(false);
    expect(isSummaryGenerating(undefined, undefined, now)).toBe(false);
  });
});
