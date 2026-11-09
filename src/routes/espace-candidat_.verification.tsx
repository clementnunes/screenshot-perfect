import { createFileRoute } from "@tanstack/react-router";
import { CandidatePortalPage } from "@/components/CandidatePortal";
import { candidateHead } from "@/lib/candidate-head";

export const Route = createFileRoute("/espace-candidat_/verification")({
  head: () => candidateHead("Vérification des réponses", "Vérifiez vos réponses avant de soumettre votre pré-entretien."),
  component: () => <CandidatePortalPage view="review" />,
});
