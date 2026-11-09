import { createFileRoute } from "@tanstack/react-router";
import { CandidatePortalPage, candidateHead } from "@/components/CandidatePortal";

export const Route = createFileRoute("/espace-candidat_/verification")({
  head: () => candidateHead("Vérification des réponses", "Vérifiez vos réponses avant de soumettre votre pré-entretien."),
  component: () => <CandidatePortalPage view="review" />,
});
