import { describe, expect, it } from "vitest";
import { parseJobDescriptionResponse } from "./job-description";

describe("fiche de poste découpée par n8n", () => {
  const sections = {
    "Intitulé": "Responsable entrepôt", "Description": "Coordonne la logistique.",
    "Missions": ["Réceptionner", "Expédier"], "Compétences attendues": "Gestion des stocks",
    "Expérience souhaitée": "3 ans", "Diplômes ou certifications pertinents": "Formation logistique",
    "Localisation": "Paris", "Type de contrat": "CDI",
  };
  it("remplit exactement les huit sections demandées sans modifier leur contenu", () => {
    expect(parseJobDescriptionResponse(sections)).toEqual({
      title: "Responsable entrepôt", description: "Coordonne la logistique.", missions: "Réceptionner\nExpédier",
      skills: "Gestion des stocks", experience: "3 ans", diplomas: "Formation logistique", location: "Paris", contract_type: "CDI",
    });
  });
  it("accepte le retour enveloppé d’un workflow n8n", () => {
    expect(parseJobDescriptionResponse([{ output: JSON.stringify(sections) }]).title).toBe("Responsable entrepôt");
  });
  it("refuse un retour incomplet plutôt que d’effacer des sections", () => {
    const { Localisation: _location, ...incomplete } = sections;
    expect(() => parseJobDescriptionResponse(incomplete)).toThrow("huit sections");
  });
  it("accepte une section explicitement vide sans inventer de diplôme", () => {
    expect(parseJobDescriptionResponse({ ...sections, "Diplômes ou certifications pertinents": "" }).diplomas).toBe("");
  });
});