import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { RecruiterShell, useActiveJob } from "@/components/RecruiterShell";
import { AddApplicationDialog } from "@/components/AddApplicationDialog";
import { BulkCvDialog } from "@/components/BulkCvDialog";
import { CandidateSheet } from "@/components/CandidateSheet";
import { AnalysisPill, InterviewPill, RecommendationPill, ScoreBar } from "@/components/StatusBadges";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FILTERS, matchesFilter, type CvAnalysisResult, type DashboardFilter } from "@/lib/recruitment";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Tableau de bord recruteur | Orvane Recrutement" },
      { name: "description", content: "Suivez les candidatures, analyses de CV et pré-entretiens d'une offre du Groupe Orvane." },
      { property: "og:title", content: "Tableau de bord recruteur | Orvane Recrutement" },
      { property: "og:description", content: "Suivez les candidatures, analyses de CV et pré-entretiens d'une offre du Groupe Orvane." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <RecruiterShell>{() => <Dashboard />}</RecruiterShell>,
});

function Dashboard() {
  const { data: job, isLoading } = useActiveJob();
  const [filter, setFilter] = useState<DashboardFilter>("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const { data: apps = [] } = useQuery({
    queryKey: ["applications", job?.id],
    enabled: !!job,
    refetchInterval: (query) => (query.state.data?.some((a) => ["extracting", "analyzing"].includes(a.analysis_status)) ? 4000 : false),
    queryFn: async () => {
      if (!job) return [];
      const { data, error } = await supabase
        .from("applications")
        .select("id, status, analysis_status, match_score, recommendation, created_at, candidates(full_name, email), interviews(status), cv_analyses(result, created_at)")
        .eq("job_id", job.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data.map((a) => {
        const latest = [...(a.cv_analyses ?? [])].sort((x, y) => y.created_at.localeCompare(x.created_at))[0]?.result as CvAnalysisResult | undefined;
        return { ...a, analysis: latest, interviewStatus: a.interviews?.status };
      });
    },
  });

  const kpis = useMemo(() => ({
    received: apps.length,
    analyzed: apps.filter((a) => a.analysis_status === "done").length,
    interviews: apps.filter((a) => a.interviewStatus === "completed").length,
    review: apps.filter((a) => matchesFilter(a, "to_review")).length,
  }), [apps]);

  const rows = apps.filter((a) => matchesFilter(a, filter) && (!q || a.candidates.full_name.toLowerCase().includes(q.toLowerCase())));

  if (isLoading) return null;
  if (!job) return <Card className="p-8 text-sm text-muted-foreground">Aucune offre. Créez-en une dans le paramétrage.</Card>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Recrutement en cours</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{job.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{job.location} · {job.contract_type} · {apps.length} candidature{apps.length > 1 ? "s" : ""}</p>
        </div>
        <div className="flex flex-wrap gap-2"><BulkCvDialog jobId={job.id} /><AddApplicationDialog jobId={job.id} /></div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Candidatures reçues", kpis.received],
          ["CV analysés", kpis.analyzed],
          ["Pré-entretiens terminés", kpis.interviews],
          ["Candidatures à examiner", kpis.review],
        ].map(([label, v], i) => (
          <Card key={label} className={cn("p-4 shadow-card", i === 3 && "border-primary/30 bg-primary-soft")}>
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className={cn("mt-2 text-2xl font-semibold tabular-nums", i === 3 && "text-primary")}>{v}</div>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden shadow-card">
        <div className="flex flex-wrap items-center gap-3 border-b p-3">
          <div className="flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <button key={f.key} onClick={() => setFilter(f.key)} className={cn("rounded-md px-3 py-1.5 text-sm", filter === f.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
                {f.label} <span className="ml-1 text-xs opacity-70">{apps.filter((a) => matchesFilter(a, f.key)).length}</span>
              </button>
            ))}
          </div>
          <div className="relative ml-auto w-full sm:w-56">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Rechercher un candidat" className="h-9 pl-8" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                {["Candidat", "Expérience professionnelle", "Compétences identifiées", "Correspondance", "Pré-entretien", "Recommandation IA", ""].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">{apps.length ? "Aucune candidature dans ce filtre." : "Aucune candidature pour le moment. Ajoutez-en une ou connectez votre automatisation."}</td></tr>
              )}
              {rows.map((a) => (
                <tr key={a.id} className="cursor-pointer border-t hover:bg-muted/40" onClick={() => setOpen(a.id)}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{a.candidates.full_name}</div>
                    <div className="mt-1"><AnalysisPill status={a.analysis_status} /></div>
                  </td>
                  <td className="max-w-[220px] px-4 py-3 text-muted-foreground">{a.analysis?.experience_summary ?? "—"}</td>
                  <td className="max-w-[240px] px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(a.analysis?.skills ?? []).slice(0, 3).map((s) => <span key={s} className="rounded bg-muted px-1.5 py-0.5 text-xs">{s}</span>)}
                      {(a.analysis?.skills.length ?? 0) > 3 && <span className="text-xs text-muted-foreground">+{(a.analysis?.skills.length ?? 0) - 3}</span>}
                      {!a.analysis && <span className="text-muted-foreground">—</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3"><ScoreBar score={a.match_score} /></td>
                  <td className="px-4 py-3"><InterviewPill status={a.interviewStatus} /></td>
                  <td className="px-4 py-3">{a.status === "decided" ? <span className="text-xs font-medium">Décision prise</span> : <RecommendationPill value={a.recommendation} />}</td>
                  <td className="px-4 py-3 text-right"><Button size="sm" variant="ghost">Examiner <ChevronRight /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="text-xs text-muted-foreground">Les recommandations IA sont une aide à la lecture. Aucune candidature n'est rejetée automatiquement : chaque décision est prise et confirmée par un recruteur.</p>

      <CandidateSheet applicationId={open} onClose={() => setOpen(null)} />
    </div>
  );
}
