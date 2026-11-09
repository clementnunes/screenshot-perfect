import { describe, expect, it } from "vitest";
import { JOB_DESCRIPTION_COLUMNS, JOB_DESCRIPTION_WEBHOOK_URL, jobDescriptionPayload, parseJobDescriptionResponse } from "./job-description";

describe("fiche de poste découpée par n8n", () => {
  it("utilise l’URL de test fournie pour le découpage", () => {
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
  it("n'expose à n8n que les huit sections de la fiche de poste", () => {
    const row = {
      id: "ba509192-ef91-4b8e-817c-15d4aea9929b",
      title: "Responsable d'entrepôt logistique (H/F)",
      description: "Coordonne la réception et l'expédition.",
      missions: "Encadrer l'équipe.",
      skills: "WMS, CACES",
      experience: "3 ans",
      diplomas: "",
      location: "Amiens (80)",
      contract_type: "CDI",
      updated_at: "2026-11-09T09:29:25.346Z",
      sender_email: "recruteur@orvane.fr",
      invitation_message: "Bonjour, nous souhaitons échanger avec vous.",
      rejection_template: "Nous ne pouvons pas donner suite.",
    };
    const payload = jobDescriptionPayload(row);
    expect(payload).toEqual({
      job_id: "ba509192-ef91-4b8e-817c-15d4aea9929b",
      title: "Responsable d'entrepôt logistique (H/F)",
      description: "Coordonne la réception et l'expédition.",
      missions: "Encadrer l'équipe.",
      skills: "WMS, CACES",
      experience: "3 ans",
      diplomas: "",
      location: "Amiens (80)",
      contract_type: "CDI",
      updated_at: "2026-11-09T09:29:25.346Z",
    });
    expect(JSON.stringify(payload)).not.toContain("rejection_template");
  });
  it("ne lit en base que les colonnes de la fiche de poste", () => {
    expect(JOB_DESCRIPTION_COLUMNS).toBe("id, updated_at, title, description, missions, skills, experience, diplomas, location, contract_type");
  });
});