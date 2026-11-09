import { createFileRoute } from "@tanstack/react-router";
import { CandidatePortalPage } from "@/components/CandidatePortal";
import { candidateHead } from "@/lib/candidate-head";

export const Route = createFileRoute("/espace-candidat_/accueil")({
  head: () => candidateHead("Votre pré-entretien", "Retrouvez votre invitation et commencez votre pré-entretien."),
  component: () => <CandidatePortalPage view="overview" />,
});
