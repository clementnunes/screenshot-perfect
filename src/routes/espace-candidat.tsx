import { createFileRoute } from "@tanstack/react-router";
import { CandidateAccess } from "@/components/CandidatePortal";
import { candidateHead } from "@/lib/candidate-head";

export const Route = createFileRoute("/espace-candidat")({
  head: () => candidateHead("Accès candidat", "Accédez à votre pré-entretien avec votre lien candidat individuel."),
  validateSearch: (s: Record<string, unknown>): { token?: string } => typeof s["token"] === "string" ? { token: s["token"] } : {},
  component: AccessPage,
});

function AccessPage() {
  const { token } = Route.useSearch();
  return <CandidateAccess token={token} />;
}
