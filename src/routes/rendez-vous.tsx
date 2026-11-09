import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RecruiterShell } from "@/components/RecruiterShell";
import { CandidateSheet } from "@/components/CandidateSheet";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/rendez-vous")({
  head: () => ({
    meta: [
      { title: "Rendez-vous | Orvane Recrutement" },
      { name: "description", content: "Liste des candidats invités à un rendez-vous par l'équipe de recrutement du Groupe Orvane." },
      { property: "og:title", content: "Rendez-vous | Orvane Recrutement" },
      { property: "og:description", content: "Liste des candidats invités à un rendez-vous par l'équipe de recrutement du Groupe Orvane." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <RecruiterShell>{() => <Meetings />}</RecruiterShell>,
});

function Meetings() {
  const [open, setOpen] = useState<string | null>(null);
  const { data = [], isLoading } = useQuery({
    queryKey: ["meetings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recruitment_decisions")
        .select("id, application_id, comment, created_at, decided_by_email, applications(match_score, candidates(full_name, email), jobs(title))")
        .eq("decision", "invite_meeting")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">Rendez-vous</h1>
      <p className="mt-1 text-sm text-muted-foreground">Candidats invités à un rendez-vous.</p>
      <Card className="mt-5 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Candidat</th>
              <th className="px-4 py-3 font-medium">Poste</th>
              <th className="px-4 py-3 font-medium">Correspondance</th>
              <th className="px-4 py-3 font-medium">Message envoyé</th>
              <th className="px-4 py-3 font-medium">Invité le</th>
              <th className="px-4 py-3 font-medium">Par</th>
            </tr>
          </thead>
          <tbody>
            {data.map((m) => (
              <tr key={m.id} className="cursor-pointer border-b last:border-0 hover:bg-muted/50" onClick={() => setOpen(m.application_id)}>
                <td className="px-4 py-3">
                  <div className="font-medium">{m.applications?.candidates?.full_name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{m.applications?.candidates?.email}</div>
                </td>
                <td className="px-4 py-3">{m.applications?.jobs?.title ?? "—"}</td>
                <td className="px-4 py-3">{m.applications?.match_score != null ? `${Math.round(m.applications.match_score)} %` : "—"}</td>
                <td className="max-w-[360px] px-4 py-3 whitespace-pre-line text-muted-foreground">{m.comment ?? "—"}</td>
                <td className="px-4 py-3">{new Date(m.created_at).toLocaleString("fr-FR")}</td>
                <td className="px-4 py-3 text-muted-foreground">{m.decided_by_email ?? "—"}</td>
              </tr>
            ))}
            {!isLoading && !data.length && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">Aucun rendez-vous pour le moment.</td></tr>
            )}
          </tbody>
        </table>
      </Card>
      <CandidateSheet applicationId={open} onClose={() => setOpen(null)} />
    </>
  );
}
