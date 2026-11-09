import { createFileRoute } from "@tanstack/react-router";
import { CandidatePortalPage, candidateHead } from "@/components/CandidatePortal";

export const Route = createFileRoute("/espace-candidat_/confirmation")({
  head: () => candidateHead("Pré-entretien transmis", "Confirmation de soumission de votre pré-entretien."),
  component: () => <CandidatePortalPage view="confirmation" />,
});
