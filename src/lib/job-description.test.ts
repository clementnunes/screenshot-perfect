import { describe, expect, it } from "vitest";
import { JOB_DESCRIPTION_WEBHOOK_URL, parseJobDescriptionResponse } from "./job-description";

describe("fiche de poste découpée par n8n", () => {
  it("utilise l’URL de production fournie pour le découpage", () => {
    expect(JOB_DESCRIPTION_WEBHOOK_URL).toBe("https://nmudhoo.n8n-wsk.com/webhook/197db861-6df7-4b3b-942d-146450422c45");
  });
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