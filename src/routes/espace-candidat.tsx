import { createFileRoute } from "@tanstack/react-router";
import { CandidateAccess, candidateHead } from "@/components/CandidatePortal";

export const Route = createFileRoute("/espace-candidat")({
  head: () => candidateHead("Accès candidat", "Recevez un lien sécurisé pour votre pré-entretien."),
  component: () => <CandidateAccess />,
});
