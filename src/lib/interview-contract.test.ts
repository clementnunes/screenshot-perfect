import { describe, expect, it } from "vitest";
import { assembleInterviewQuestions, canAccessByLink, canSubmitInterview, interviewQuestionsInput, isActiveInvitation } from "./interview-contract";

describe("questions pilotées par n8n", () => {
  const active = { token_revoked: false, token_expires_at: "2026-11-10T12:00:00Z" };
  const now = Date.parse("2026-11-09T13:00:00Z");
  it("ouvre le pré-entretien par lien actif et e-mail sans invitation envoyée", () => {
    expect(canAccessByLink(active, "candidat@example.com", " CANDIDAT@example.com ", now)).toBe(true);
  });
  it("refuse un e-mail différent", () => {
    expect(canAccessByLink(active, "candidat@example.com", "autre@example.com", now)).toBe(false);
  });
  it("refuse un lien révoqué", () => {
    expect(canAccessByLink({ ...active, token_revoked: true }, "candidat@example.com", "candidat@example.com", now)).toBe(false);
  });
  it("refuse un lien expiré ou sans échéance", () => {
    expect(canAccessByLink(active, "candidat@example.com", "candidat@example.com", Date.parse("2026-11-11T12:00:00Z"))).toBe(false);
    expect(canAccessByLink({ ...active, token_expires_at: null }, "candidat@example.com", "candidat@example.com", now)).toBe(false);
  });
  it("accepte quatre questions communes et deux personnalisées", () => {
    expect(interviewQuestionsInput.safeParse([...Array.from({ length: 4 }, () => ({ question: "Expérience professionnelle ?", kind: "common" })), ...Array.from({ length: 2 }, () => ({ question: "Projet du CV ?", kind: "personalized" }))]).success).toBe(true);
  });
  it("accepte toutes les questions existantes sans limite à six", () => {
    expect(interviewQuestionsInput.parse(Array.from({ length: 10 }, (_, i) => ({ question: `Question ${i}`, kind: "personalized" }))).length).toBe(10);
  });
  it("conserve le texte et déduplique sans générer de questions", () => {
    expect(assembleInterviewQuestions([" Expérience ?", "Management ?"], ["expérience ?", "Projet CV ?"])).toEqual([{ question: " Expérience ?", kind: "common" }, { question: "Management ?", kind: "common" }, { question: "Projet CV ?", kind: "personalized" }]);
  });
  it("refuse la soumission tant qu'une réponse est vide", () => {
    expect(canSubmitInterview([{ id: "1" }, { id: "2" }], [{ question_id: "1", answer_text: "Réponse" }, { question_id: "2", answer_text: " " }])).toBe(false);
    expect(canSubmitInterview([{ id: "1" }], [{ question_id: "1", answer_text: "Réponse" }])).toBe(true);
  });
  it("refuse une invitation expirée, révoquée ou non envoyée", () => {
    const app = { token_revoked: false, token_expires_at: "2026-11-10T12:00:00Z" };
    const iv = { invited_at: "2026-11-09T12:00:00Z" };
    const now = Date.parse("2026-11-09T13:00:00Z");
    expect(isActiveInvitation(app, iv, now)).toBe(true);
    expect(isActiveInvitation({ ...app, token_revoked: true }, iv, now)).toBe(false);
    expect(isActiveInvitation(app, iv, Date.parse("2026-11-11T12:00:00Z"))).toBe(false);
    expect(isActiveInvitation(app, null, now)).toBe(false);
  });
});