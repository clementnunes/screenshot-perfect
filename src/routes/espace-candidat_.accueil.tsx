import { createFileRoute } from "@tanstack/react-router";
import { CandidatePortalPage, candidateHead } from "@/components/CandidatePortal";

export const Route = createFileRoute("/espace-candidat_/accueil")({
  head: () => candidateHead("Votre pré-entretien", "Retrouvez votre invitation et commencez votre pré-entretien."),
  component: () => <CandidatePortalPage view="overview" />,
});
