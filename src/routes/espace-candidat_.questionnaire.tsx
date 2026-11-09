import { createFileRoute } from "@tanstack/react-router";
import { CandidatePortalPage, candidateHead } from "@/components/CandidatePortal";

export const Route = createFileRoute("/espace-candidat_/questionnaire")({
  head: () => candidateHead("Questionnaire candidat", "Répondez aux questions de votre pré-entretien."),
  validateSearch: (s: Record<string, unknown>): { question?: number } => typeof s["question"] === "number" && Number.isInteger(s["question"]) && s["question"] >= 0 ? { question: s["question"] } : {},
  component: QuestionnairePage,
});

function QuestionnairePage() {
  const { question } = Route.useSearch();
  return <CandidatePortalPage view="questions" questionIndex={question} />;
}
