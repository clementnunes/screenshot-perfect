import { describe, expect, it } from "vitest";
import { interviewQuestionsInput } from "./interview-contract";

describe("questions pilotées par n8n", () => {
  it("accepte quatre questions communes et deux personnalisées", () => {
    expect(interviewQuestionsInput.safeParse([...Array.from({ length: 4 }, () => ({ question: "Expérience professionnelle ?", kind: "common" })), ...Array.from({ length: 2 }, () => ({ question: "Projet du CV ?", kind: "personalized" }))]).success).toBe(true);
  });
  it("refuse six questions communes sans personnalisation", () => {
    expect(interviewQuestionsInput.safeParse(Array.from({ length: 6 }, () => ({ question: "Expérience ?", kind: "common" }))).success).toBe(false);
  });
});