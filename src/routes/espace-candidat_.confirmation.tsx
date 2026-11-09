import { createFileRoute } from "@tanstack/react-router";
import { CandidatePortalPage } from "@/components/CandidatePortal";
import { candidateHead } from "@/lib/candidate-head";

export const Route = createFileRoute("/espace-candidat_/confirmation")({
  head: () => candidateHead("Pré-entretien transmis", "Confirmation de soumission de votre pré-entretien."),
  component: () => <CandidatePortalPage view="confirmation" />,
});
