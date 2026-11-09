import { createFileRoute, Link } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { OrvaneLogo } from "@/components/RecruiterShell";
import { BulkCvDialog } from "@/components/BulkCvDialog";
import { candidateHead } from "@/lib/candidate-head";

export const Route = createFileRoute("/candidats")({
  head: () => candidateHead("Postuler chez Orvane", "Déposez votre CV au format PDF : il est transmis à l’équipe de recrutement du Groupe Orvane et analysé automatiquement."),
  component: CandidateHome,
});

function CandidateHome() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card"><div className="mx-auto flex min-h-20 max-w-4xl items-center justify-between gap-4 px-5"><OrvaneLogo /><Link to="/espace-candidat" className="text-sm font-medium text-primary hover:underline">Accéder à mon pré-entretien</Link></div></header>
      <main className="mx-auto max-w-3xl px-5 py-14">
        <div className="mb-8 flex h-12 w-12 items-center justify-center rounded-md bg-primary-soft text-primary"><FileText /></div>
        <h1 className="text-3xl font-semibold leading-tight">Bienvenue, candidat</h1>
        <p className="mt-4 max-w-xl text-muted-foreground">Déposez votre CV au format PDF. Il rejoint directement nos candidatures et son analyse démarre automatiquement. Chaque décision est ensuite prise par un recruteur.</p>
        <div className="mt-9"><BulkCvDialog publicMode /></div>
      </main>
      <footer className="mx-auto max-w-3xl border-t px-5 py-6 text-xs text-muted-foreground">Groupe Orvane · Espace candidat</footer>
    </div>
  );
}
