import { test, expect } from "vitest";
import { parseCvResult } from "./cv-contract";
test("76", () => {
  for (const c of [76, "76", "76 %"]) {
    const r = parseCvResult([{ correspondance_pourcentage: c, recommandation_ia: { niveau: "PROFIL_PERTINENT", synthese: "x" }, analyse_complete: { correspondance_pourcentage: {} } }]);
    expect(r?.detail?.scoreGlobal).toBe(76);
  }
});
