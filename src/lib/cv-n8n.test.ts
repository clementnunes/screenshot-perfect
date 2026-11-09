import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { parseCvResult } from "./cv-contract";
import { computeCategoryScore, levelToRecommendation } from "./recruitment";

describe("n8n CV analysis format", () => {
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
