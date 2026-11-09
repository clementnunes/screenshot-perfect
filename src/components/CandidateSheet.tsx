import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Check, FileText, Link2, RefreshCw, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ANALYSIS_STEPS, analysisScore, DECISION_LABEL, type CvAnalysisView, type N8nDetail, type InterviewSummary } from "@/lib/recruitment";
import { eraseCandidate, recordDecision, regenerateCandidateLink, retryCvAnalysis, retryInterviewAnalysis, revokeCandidateLink, requestInterview } from "@/lib/recruitment.functions";
import { CriterionPill, InterviewPill, RecommendationPill, ScoreBar } from "./StatusBadges";
import { CandidateLinkBox } from "./AddApplicationDialog";
import { cn } from "@/lib/utils";

type Decision = "invite_meeting" | "request_verification" | "reject";

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="border-t px-6 py-5">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <span className="grid h-5 w-5 place-items-center rounded-full bg-muted text-[11px] text-muted-foreground">{n}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function Progress({ status, error, onRetry, retrying }: { status: string; error: string | null; onRetry: () => void; retrying: boolean }) {
  const idx = ANALYSIS_STEPS.findIndex((s) => s.key === status);
  if (status === "error") {
    return (
      <div className="flex items-start gap-3 rounded-md bg-danger-soft p-3 text-sm">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        <div className="flex-1">
          <div className="font-medium text-destructive">Erreur à traiter</div>
          <div className="text-muted-foreground">{error}</div>
        </div>
        <Button size="sm" variant="outline" onClick={onRetry} disabled={retrying}><RefreshCw className={cn(retrying && "animate-spin")} /> Relancer</Button>
      </div>
    );
  }
  return (
    <ol className="flex items-center gap-2 text-xs">
      {ANALYSIS_STEPS.map((s, i) => (
        <li key={s.key} className="flex flex-1 items-center gap-2">
          <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full border", i < idx || status === "done" ? "border-primary bg-primary text-primary-foreground" : i === idx ? "border-primary text-primary" : "text-muted-foreground")}>
            {i < idx || status === "done" ? <Check className="h-3 w-3" /> : i + 1}
          </span>
          <span className={cn(i === idx ? "font-medium" : "text-muted-foreground")}>{s.label}</span>
          {i < ANALYSIS_STEPS.length - 1 && <span className="h-px flex-1 bg-border" />}
        </li>
      ))}
    </ol>
  );
}

export function CandidateSheet({ applicationId, onClose }: { applicationId: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [pending, setPending] = useState<Decision | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<{ token: string; expiresAt: string } | null>(null);
  const decide = useServerFn(recordDecision);
  const retry = useServerFn(retryCvAnalysis);
  const retryInterview = useServerFn(retryInterviewAnalysis);
  const regen = useServerFn(regenerateCandidateLink);
  const revoke = useServerFn(revokeCandidateLink);
  const erase = useServerFn(eraseCandidate);
  const invite = useServerFn(requestInterview);

  const { data } = useQuery({
    queryKey: ["application", applicationId],
    enabled: !!applicationId,
    refetchInterval: 5000,
    queryFn: async () => {
      const id = applicationId;
      if (!id) throw new Error("Candidature indisponible.");
      const { data: app, error } = await supabase.from("applications").select("*, candidates(*), jobs(title, rejection_template)").eq("id", id).single();
      if (error) throw error;
      const [analyses, interview, questions, decisions] = await Promise.all([
        supabase.from("cv_analyses").select("*").eq("application_id", id).order("created_at", { ascending: false }),
        supabase.from("interviews").select("*, interview_answers(*)").eq("application_id", id).maybeSingle(),
        supabase.from("interview_questions").select("*").or(`and(job_id.eq.${app.job_id},application_id.is.null,kind.eq.common),application_id.eq.${id}`).order("position"),
        supabase.from("recruitment_decisions").select("*").eq("application_id", id).order("created_at", { ascending: false }),
      ]);
      const cvUrl = app.cv_path ? (await supabase.storage.from("cvs").createSignedUrl(app.cv_path, 600)).data?.signedUrl ?? null : null;
      const allQuestions = questions.data ?? [];
      const interviewQuestions = allQuestions.some((q) => q.application_id === id && q.kind === "common") ? allQuestions.filter((q) => q.application_id === id) : allQuestions;
      return { app, analyses: analyses.data ?? [], interview: interview.data, questions: interviewQuestions, decisions: decisions.data ?? [], cvUrl };
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["application", applicationId] });
    qc.invalidateQueries({ queryKey: ["applications"] });
  };

  async function run<T>(fn: () => Promise<T>, ok?: string): Promise<T | undefined> {
    setBusy(true);
    try {
      const r = await fn();
      if (ok) toast.success(ok);
      refresh();
      return r;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  const analysis = data?.analyses[0]?.result as CvAnalysisView | undefined;
  const summary = data?.interview?.summary as InterviewSummary | null | undefined;
  const answers = data?.interview?.interview_answers ?? [];

  return (
    <Sheet open={!!applicationId} onOpenChange={(o) => { if (!o) { setLink(null); onClose(); } }}>
      <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-2xl">
        {!data ? (
          <div className="p-6 text-sm text-muted-foreground">Chargement…</div>
        ) : (
          <>
            {/* 1. Informations */}
            <SheetHeader className="space-y-1 px-6 pb-5 pt-6 text-left">
              <SheetTitle className="text-xl">{data.app.candidates.full_name}</SheetTitle>
              <SheetDescription>{data.app.candidates.email} · {data.app.jobs.title} · reçue le {new Date(data.app.created_at).toLocaleDateString("fr-FR")}</SheetDescription>
              <div className="flex flex-wrap items-center gap-3 pt-3">
                <ScoreBar score={analysisScore(analysis, data.app.match_score)} />
                <RecommendationPill value={data.app.recommendation} />
                <InterviewPill status={data.interview?.status} />
              </div>
              <div className="pt-4">
                <Progress status={data.app.analysis_status} error={data.app.analysis_error} retrying={busy} onRetry={() => run(() => retry({ data: { applicationId: data.app.id } }))} />
                {data.app.cv_path && !["extracting", "analyzing"].includes(data.app.analysis_status) && <Button className="mt-3" size="sm" variant="outline" disabled={busy} onClick={() => run(async () => { const r = await retry({ data: { applicationId: data.app.id } }); if (!r.ok) throw new Error(r.error); return r; })}><FileText /> {data.app.analysis_status === "done" ? "Relancer l'analyse du CV" : "Analyser le CV"}</Button>}
              </div>
            </SheetHeader>

            <Section n={1} title="Informations du candidat">
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-xs text-muted-foreground">Expérience</dt><dd>{analysis?.experience_summary ?? "—"}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Source</dt><dd>{data.app.source === "n8n" ? "Automatisation" : data.app.source === "recruiter" ? "Ajout recruteur" : data.app.source}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Identité confirmée</dt><dd>{data.app.identity_confirmed_at ? new Date(data.app.identity_confirmed_at).toLocaleString("fr-FR") : "Non"}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Lien candidat</dt><dd>{data.app.token_revoked ? "Révoqué" : data.app.token_expires_at ? `Expire le ${new Date(data.app.token_expires_at).toLocaleDateString("fr-FR")}` : "—"}</dd></div>
              </dl>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={busy} onClick={async () => { const r = await run(() => regen({ data: { applicationId: data.app.id } })); if (r) setLink(r); }}><Link2 /> Générer un nouveau lien</Button>
                {!data.app.token_revoked && <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => revoke({ data: { applicationId: data.app.id } }), "Lien révoqué")}>Révoquer le lien</Button>}
              </div>
              {link && <div className="mt-3"><CandidateLinkBox {...link} /></div>}
            </Section>

            <Section n={2} title="CV original">
              {data.cvUrl ? (
                <div className="space-y-2">
                  <iframe src={data.cvUrl} title="CV" className="h-96 w-full rounded-md border" />
                  <a href={data.cvUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline"><FileText className="h-4 w-4" /> {data.app.cv_filename ?? "Ouvrir le CV"}</a>
                </div>
              ) : <p className="text-sm text-muted-foreground">Le candidat n'a pas encore déposé de CV.</p>}
            </Section>

            {analysis?.detail ? <N8nSections analysis={analysis} detail={analysis.detail} count={data.analyses.length} /> : (<>
            <Section n={3} title="Synthèse de l'analyse IA">
              {analysis ? (
                <div className="space-y-2 text-sm">
                  <p>{analysis.candidate_summary}</p>
                  <div className="flex flex-wrap gap-1.5">{analysis.skills.map((s) => <span key={s} className="rounded bg-muted px-1.5 py-0.5 text-xs">{s}</span>)}</div>
                  <p className="text-xs text-muted-foreground">Qualité d'extraction : {Math.round(analysis.confidence * 100)} % · {data.analyses.length} analyse(s) conservée(s). Proposition d'aide à la décision, non décisionnelle.</p>
                </div>
              ) : <p className="text-sm text-muted-foreground">Aucune analyse disponible.</p>}
            </Section>

            <Section n={4} title="Correspondance critères / CV">
              {analysis ? (
                <div className="overflow-hidden rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/60 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2 font-medium">Critère</th><th className="px-3 py-2 font-medium">Statut</th><th className="px-3 py-2 font-medium">Élément du CV</th></tr></thead>
                    <tbody>
                      {analysis.criteria_analysis.map((c) => (
                        <tr key={c.criterion} className="border-t align-top"><td className="px-3 py-2 font-medium">{c.criterion}</td><td className="px-3 py-2"><CriterionPill status={c.status} /></td><td className="px-3 py-2 text-muted-foreground">{c.evidence || "—"}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="text-sm text-muted-foreground">—</p>}
            </Section>

            <Section n={5} title="Justifications et références">
              {analysis ? (
                <ul className="space-y-2 text-sm">
                  {analysis.criteria_analysis.filter((c) => c.evidence).map((c) => (
                    <li key={c.criterion} className="rounded-md border-l-2 border-primary bg-muted/40 px-3 py-2">
                      <div className="italic">« {c.evidence} »</div>
                      <div className="mt-1 text-xs text-muted-foreground">{c.criterion} · {c.source}</div>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-muted-foreground">—</p>}
            </Section>

            <Section n={6} title="Informations manquantes">
              {analysis?.missing_information.length ? (
                <ul className="list-disc space-y-1 pl-5 text-sm">{analysis.missing_information.map((m) => <li key={m}>{m}</li>)}</ul>
              ) : <p className="text-sm text-muted-foreground">Aucune information manquante signalée.</p>}
            </Section>

            </>)}

            <Section n={7} title="Questions et réponses du pré-entretien">
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <InterviewPill status={data.interview?.status} />
                <span className="text-xs text-muted-foreground">{answers.filter((a) => a.answer_text.trim()).length} / {data.interview ? data.questions.length : 6} réponses</span>
                <Button size="sm" variant="outline" disabled={busy || !data.app.cv_path || data.app.status === "decided" || (!!data.interview && data.interview.status !== "not_started")} onClick={() => run(() => invite({ data: { applicationId: data.app.id, origin: window.location.origin } }), "Demande de pré-entretien transmise à n8n")}>Préparer et inviter via n8n</Button>
              </div>
              {data.interview && data.questions.length ? (
                <ol className="space-y-3 text-sm">
                  {data.questions.map((q, i) => {
                    const a = answers.find((x) => x.question_id === q.id);
                    return (
                      <li key={q.id}>
                        <div className="font-medium">{i + 1}. {q.question} {q.kind === "personalized" && <span className="ml-1 text-xs font-normal text-primary">personnalisée</span>}</div>
                        <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{a?.answer_text || "Pas encore de réponse."}</p>
                      </li>
                    );
                  })}
                </ol>
              ) : <p className="text-sm text-muted-foreground">En attente des questions et de l’invitation n8n.</p>}
            </Section>

            <Section n={8} title="Synthèse du pré-entretien">
              {summary ? (
                <div className="space-y-3 text-sm">
                  <p>{summary.summary}</p>
                  {summary.strengths.length > 0 && <div><div className="text-xs font-medium text-muted-foreground">Points étayés</div><ul className="list-disc pl-5">{summary.strengths.map((s) => <li key={s}>{s}</li>)}</ul></div>}
                  {summary.points_to_verify.length > 0 && <div><div className="text-xs font-medium text-muted-foreground">À vérifier</div><ul className="list-disc pl-5">{summary.points_to_verify.map((s) => <li key={s}>{s}</li>)}</ul></div>}
                </div>
              ) : data.interview?.analysis_status === "error" ? (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => retryInterview({ data: { applicationId: data.app.id } }))}><RefreshCw /> Relancer l'analyse du pré-entretien</Button>
              ) : <p className="text-sm text-muted-foreground">{data.interview?.status === "completed" ? "Analyse en cours…" : "Disponible lorsque le candidat aura terminé."}</p>}
            </Section>

            {data.decisions.length > 0 && (
              <section className="border-t px-6 py-5">
                <h3 className="mb-2 text-sm font-semibold">Historique des décisions</h3>
                <ul className="space-y-1 text-sm">{data.decisions.map((d) => <li key={d.id}><span className="font-medium">{DECISION_LABEL[d.decision]}</span> <span className="text-muted-foreground">— {d.decided_by_email} · {new Date(d.created_at).toLocaleString("fr-FR")}{d.comment ? ` · « ${d.comment} »` : ""}</span></li>)}</ul>
              </section>
            )}

            <div className="sticky bottom-0 border-t bg-card px-6 py-4">
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => setPending("invite_meeting")}>Inviter à un rendez-vous</Button>
                <Button variant="outline" onClick={() => setPending("request_verification")}>Demander une vérification</Button>
                <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setPending("reject")}>Refuser la candidature</Button>
                <Button variant="ghost" size="icon" className="ml-auto" aria-label="Effacer les données du candidat" onClick={() => { if (confirm("Effacer définitivement ce candidat, ses candidatures et ses documents (droit à l'effacement) ?")) run(() => erase({ data: { candidateId: data.app.candidate_id } }), "Données effacées").then(onClose); }}><Trash2 /></Button>
              </div>
            </div>

            <AlertDialog open={!!pending} onOpenChange={(o) => { if (!o) { setPending(null); setComment(""); } }}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{pending && DECISION_LABEL[pending]} — confirmer ?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Cette décision est la vôtre et sera enregistrée à votre nom. {pending === "reject" && "Le candidat recevra le modèle de réponse négative défini dans le paramétrage."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                {pending === "reject" && <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">{data.app.jobs.rejection_template}</p>}
                <Textarea placeholder="Commentaire (facultatif)" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} />
                <AlertDialogFooter>
                  <AlertDialogCancel>Annuler</AlertDialogCancel>
                  <AlertDialogAction disabled={busy} onClick={() => { const d = pending; if (!d) return; run(() => decide({ data: { applicationId: data.app.id, decision: d, comment: comment || undefined, confirmed: true } }), "Décision enregistrée"); setComment(""); }}>
                    Confirmer la décision
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

const SKILL_STATUS: Record<string, string> = { DEMONTREE: "Démontrée", MENTIONNEE: "Mentionnée", ABSENTE: "Absente", A_VERIFIER: "À vérifier" };

function List({ items, tone }: { items: string[]; tone?: "good" | "warn" }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">—</p>;
  return (
    <ul className="space-y-1.5 text-sm">
      {items.map((t) => (
        <li key={t} className={cn("rounded-md border-l-2 bg-muted/40 px-3 py-1.5", tone === "good" ? "border-primary" : tone === "warn" ? "border-destructive/60" : "border-border")}>{t}</li>
      ))}
    </ul>
  );
}

function N8nSections({ analysis, detail, count }: { analysis: CvAnalysisView; detail: N8nDetail; count: number }) {
  return (
    <>
      <Section n={3} title="Synthèse de l'analyse IA">
        <div className="space-y-3 text-sm">
          {detail.level && <span className="inline-block rounded bg-muted px-2 py-0.5 text-xs font-medium">{detail.level.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase())}</span>}
          <p>{analysis.candidate_summary}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><div className="mb-1.5 text-xs font-medium text-muted-foreground">Points forts</div><List items={detail.strengths} tone="good" /></div>
            <div><div className="mb-1.5 text-xs font-medium text-muted-foreground">Écarts avec la fiche</div><List items={detail.gaps} tone="warn" /></div>
          </div>
          <p className="text-xs text-muted-foreground">{count} analyse(s) conservée(s). Proposition d'aide à la décision, non décisionnelle.</p>
        </div>
      </Section>

      <Section n={4} title="Expérience professionnelle">
        <ul className="space-y-3 text-sm">
          {detail.experiences.map((e, i) => (
            <li key={i} className="rounded-md border p-3">
              <div className="flex flex-wrap justify-between gap-2"><span className="font-medium">{e.intitule_poste} · {e.entreprise}</span><span className="text-xs text-muted-foreground">{e.periode as string}{e.duree_exploitable ? ` · ${e.duree_exploitable as string}` : ""}</span></div>
              {Array.isArray(e.responsabilites) && <ul className="mt-2 list-disc space-y-0.5 pl-5 text-muted-foreground">{(e.responsabilites as string[]).map((r) => <li key={r}>{r}</li>)}</ul>}
              {typeof e.lien_aux_missions_du_poste === "string" && <p className="mt-2 text-xs text-primary">{e.lien_aux_missions_du_poste}</p>}
            </li>
          ))}
          {!detail.experiences.length && <p className="text-muted-foreground">{analysis.experience_summary || "—"}</p>}
        </ul>
      </Section>

      <Section n={5} title="Compétences identifiées">
        <div className="space-y-4">
          {detail.skills.filter((g) => g.items.length).map((g) => (
            <div key={g.group}>
              <div className="mb-1.5 text-xs font-medium uppercase text-muted-foreground">{g.group}</div>
              <div className="overflow-hidden rounded-md border">
                <table className="w-full text-sm"><tbody>
                  {g.items.map((s) => (
                    <tr key={s.competence} className="border-t align-top first:border-t-0">
                      <td className="w-1/3 px-3 py-2 font-medium">{s.competence}</td>
                      <td className="px-3 py-2"><span className={cn("rounded px-1.5 py-0.5 text-xs", s.statut === "DEMONTREE" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>{SKILL_STATUS[s.statut] ?? s.statut}</span></td>
                      <td className="px-3 py-2 text-muted-foreground">{s.justification}</td>
                    </tr>
                  ))}
                </tbody></table>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section n={6} title="Correspondance pondérée et points à vérifier">
        <div className="space-y-4 text-sm">
          {detail.categories.map((c) => (
            <div key={c.key}>
              <div className="flex justify-between"><span className="font-medium">{c.label}</span><span className="text-xs text-muted-foreground">{c.score} / 100 · poids {c.weight} %</span></div>
              <div className="mt-1 h-1.5 rounded bg-muted"><div className="h-full rounded bg-primary" style={{ width: `${Math.max(0, Math.min(100, c.score))}%` }} /></div>
              {c.justification && <p className="mt-1 text-xs text-muted-foreground">{c.justification}</p>}
            </div>
          ))}
          {detail.limitations && <p className="text-xs text-muted-foreground">Limites : {detail.limitations}</p>}
          <div><div className="mb-1.5 text-xs font-medium text-muted-foreground">Informations manquantes</div><List items={analysis.missing_information} /></div>
          <div><div className="mb-1.5 text-xs font-medium text-muted-foreground">Points à vérifier en entretien</div><List items={detail.to_verify} /></div>
          {detail.suggested_questions.length > 0 && <div><div className="mb-1.5 text-xs font-medium text-muted-foreground">Questions suggérées par l'analyse</div><ol className="list-decimal space-y-1 pl-5">{detail.suggested_questions.map((q) => <li key={q}>{q}</li>)}</ol></div>}
        </div>
      </Section>
    </>
  );
}
