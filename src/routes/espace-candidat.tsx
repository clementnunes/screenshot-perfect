import { createFileRoute } from "@tanstack/react-router";
import { CandidateAccess } from "@/components/CandidatePortal";
import { candidateHead } from "@/lib/candidate-head";

export const Route = createFileRoute("/espace-candidat")({
  head: () => candidateHead("Accès candidat", "Recevez un lien sécurisé pour votre pré-entretien."),
  component: () => <CandidateAccess />,
});
