import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, CheckCircle2, ClipboardCheck, LockKeyhole, LogOut, Mail } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { OrvaneLogo } from "./RecruiterShell";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Checkbox } from "./ui/checkbox";
import { Progress } from "./ui/progress";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from "./ui/alert-dialog";
import { getPortalSession, requestCandidateAccess, savePortalAnswer, startPortalInterview, submitPortalInterview } from "@/lib/candidate-portal.functions";
import { canSubmitInterview } from "@/lib/interview-contract";

export function candidateHead(title: string, description: string) {
  return { meta: [{ title: `${title} | Orvane Recrutement` }, { name: "description", content: description }, { property: "og:title", content: `${title} | Orvane Recrutement` }, { property: "og:description", content: description }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex, nofollow" }] };
}

function PortalShell({ children, signedIn = false }: { children: ReactNode; signedIn?: boolean }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  return <div className="min-h-screen bg-background"><header className="border-b bg-card"><div className="mx-auto flex min-h-20 max-w-4xl items-center justify-between gap-4 px-5"><OrvaneLogo />{signedIn ? <Button variant="ghost" size="sm" onClick={async () => { await qc.cancelQueries(); qc.clear(); await supabase.auth.signOut(); await navigate({ to: "/espace-candidat", replace: true }); }}><LogOut className="h-4 w-4" /><span className="hidden sm:inline">Quitter mon espace</span></Button> : <LockKeyhole className="h-5 w-5 text-primary" />}</div></header><main className="mx-auto max-w-3xl px-5 py-10 sm:py-14">{children}</main><footer className="mx-auto max-w-3xl border-t px-5 py-6 text-xs text-muted-foreground">Groupe Orvane · Espace candidat sécurisé</footer></div>;
}

export function CandidateAccess() {
  const request = useServerFn(requestCandidateAccess);
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  useEffect(() => { supabase.auth.getUser().then(({ data }) => { if (data.user) void navigate({ to: "/espace-candidat/accueil" }); }); }, [navigate]);
  return <PortalShell><div className="mb-8 flex h-12 w-12 items-center justify-center rounded-md bg-primary-soft text-primary"><Mail /></div><h1 className="text-3xl font-semibold leading-tight">Bienvenue sur votre espace candidat</h1><p className="mt-4 max-w-xl text-muted-foreground">Accédez à votre pré-entretien et échangez avec notre équipe de recrutement.</p>{sent ? <div role="status" className="mt-8 flex gap-3 border-l-2 border-primary bg-primary-soft p-5"><CheckCircle2 className="h-5 w-5 shrink-0 text-primary" /><p className="text-sm">Si une invitation correspond à cette adresse, vous recevrez un e-mail contenant votre lien d'accès.</p></div> : <form className="mt-9 max-w-md space-y-5" onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { await request({ data: { email, origin: window.location.origin } }); setSent(true); } catch { toast.error("L’envoi est indisponible. Réessayez dans un instant."); } finally { setBusy(false); } }}><div className="space-y-2"><Label htmlFor="candidate-email">Adresse e-mail</Label><Input id="candidate-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-12" /></div><Button type="submit" disabled={busy} className="h-12 w-full">{busy ? "Envoi…" : "Continuer"}<ArrowRight /></Button><p className="text-sm leading-relaxed text-muted-foreground">Un lien sécurisé à usage unique vous sera envoyé par e-mail si vous avez reçu une invitation.</p></form>}<Button variant="link" className="mt-7 px-0" onClick={() => setPrivacy(true)}>Politique de confidentialité</Button><AlertDialog open={privacy} onOpenChange={setPrivacy}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Données personnelles</AlertDialogTitle><AlertDialogDescription>Le Groupe Orvane traite votre CV et vos réponses uniquement pour ce recrutement. L’IA assiste les recruteurs sans prendre de décision. Votre voix, votre accent et vos émotions ne sont pas analysés. Pour exercer vos droits d’accès, de rectification ou d’effacement, contactez l’équipe recrutement.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Fermer</AlertDialogCancel></AlertDialogFooter></AlertDialogContent></AlertDialog></PortalShell>;
}

type PortalSession = Awaited<ReturnType<typeof getPortalSession>>;
export function CandidatePortalPage({ view, questionIndex }: { view: "overview" | "questions" | "review" | "confirmation"; questionIndex?: number | undefined }) {
  const get = useServerFn(getPortalSession);
  const [ready, setReady] = useState<boolean | null>(null);
  const navigate = useNavigate();
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setReady(!!data.user)); }, []);
  const query = useQuery({ queryKey: ["portal-session"], queryFn: () => get(), enabled: ready === true, retry: false });
  useEffect(() => { if (query.data?.status === "completed" && view !== "confirmation") void navigate({ to: "/espace-candidat/confirmation", replace: true }); }, [query.data?.status, view, navigate]);
  if (ready === null || (ready && query.isPending)) return <PortalShell><p className="text-muted-foreground">Chargement de votre pré-entretien…</p></PortalShell>;
  if (!ready || query.error || !query.data) return <PortalShell><LockKeyhole className="mb-5 h-8 w-8 text-primary" /><h1 className="text-2xl font-semibold">Accès à votre pré-entretien</h1><p className="mt-4 text-muted-foreground">{query.error ? "Votre invitation n’est plus valide ou votre lien de connexion a expiré." : "Connectez-vous avec le lien sécurisé reçu par e-mail."}</p><Button className="mt-6" onClick={() => navigate({ to: "/espace-candidat" })}>Recevoir un lien</Button></PortalShell>;
  return <PortalShell signedIn>{view === "overview" ? <Overview session={query.data} /> : view === "confirmation" && query.data.status === "completed" ? <Confirmation session={query.data} /> : <Questionnaire key={`${query.data.startedAt}:${questionIndex ?? "resume"}`} session={query.data} initialReview={view === "review"} questionIndex={questionIndex} />}</PortalShell>;
}

function Overview({ session: s }: { session: PortalSession }) {
  const start = useServerFn(startPortalInterview);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [consent, setConsent] = useState(s.consent);
  const [busy, setBusy] = useState(false);
  const common = s.questions.filter((q) => q.kind === "common").length;
  return <><span className="text-sm font-medium text-primary">Groupe Orvane · {s.job.title}</span><h1 className="mt-3 text-3xl font-semibold">Votre pré-entretien</h1><p className="mt-5 leading-relaxed text-muted-foreground">Ce pré-entretien nous permettra de mieux comprendre votre parcours, vos expériences et votre approche professionnelle. Répondez librement et avec précision. Vos réponses seront transmises à notre équipe de recrutement.</p><dl className="my-8 grid grid-cols-2 gap-6 border-y py-6 text-sm"><div><dt className="text-muted-foreground">Questions</dt><dd className="mt-1 font-semibold">{s.questions.length} au total</dd></div><div><dt className="text-muted-foreground">Durée estimée</dt><dd className="mt-1 font-semibold">{s.questions.length * 3} minutes</dd></div><div><dt className="text-muted-foreground">Répartition</dt><dd className="mt-1">{common} communes · {s.questions.length - common} personnalisées</dd></div><div><dt className="text-muted-foreground">Date limite</dt><dd className="mt-1">{s.expiresAt ? new Date(s.expiresAt).toLocaleDateString("fr-FR") : "—"}</dd></div></dl><ul className="list-disc space-y-3 pl-5 text-sm text-muted-foreground"><li>Répondez à chaque question avec vos propres mots.</li><li>Prenez le temps de développer vos réponses.</li><li>Vos réponses doivent refléter votre expérience réelle.</li><li>Vous pouvez enregistrer votre progression et reprendre ultérieurement.</li></ul><label className="mt-8 flex items-start gap-3 text-sm"><Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} />J’accepte le traitement de mes réponses pour ce recrutement. Elles seront examinées par un recruteur ; l’IA ne prend aucune décision.</label><Button className="mt-7 h-12" disabled={!consent || busy || !s.questions.length} onClick={async () => { setBusy(true); try { await start({ data: { consent: true } }); await qc.invalidateQueries({ queryKey: ["portal-session"] }); await navigate({ to: "/espace-candidat/questionnaire" }); } catch (e) { toast.error(e instanceof Error ? e.message : "Impossible de commencer"); } finally { setBusy(false); } }}>{busy ? "Chargement…" : s.startedAt ? "Reprendre mon pré-entretien" : "Commencer mon pré-entretien"}<ArrowRight /></Button></>;
}

function Questionnaire({ session: s, initialReview, questionIndex }: { session: PortalSession; initialReview: boolean; questionIndex?: number | undefined }) {
  const save = useServerFn(savePortalAnswer);
  const submit = useServerFn(submitPortalInterview);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [index, setIndex] = useState(Math.min(questionIndex ?? s.currentIndex, Math.max(0, s.questions.length - 1)));
  const [answers, setAnswers] = useState<Record<string, string>>(() => Object.fromEntries(s.answers.map((a) => [a.question_id, a.answer_text])));
  const [status, setStatus] = useState("Toutes les réponses reçues sont enregistrées");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const latest = useRef(answers);
  latest.current = answers;
  const revisions = useRef<Record<string, number>>({});
  const queue = useRef<Promise<void>>(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const q = s.questions[index];
  const text = q ? answers[q.id] ?? "" : "";
  const review = initialReview;
  const persist = (questionId: string, value: string, position: number) => {
    const rev = revisions.current[questionId] ?? 0;
    const task = queue.current.catch(() => {}).then(async () => {
      setStatus("Enregistrement…");
      await save({ data: { questionId, text: value, index: position } });
      if (revisions.current[questionId] === rev) setStatus("Réponse enregistrée");
    });
    queue.current = task;
    return task;
  };
  useEffect(() => {
    if (!q || review || !(q.id in answers)) return;
    timer.current = setTimeout(() => { void persist(q.id, text, index).catch(() => setStatus("Échec de sauvegarde — réessayez avant de quitter")); }, 700);
    return () => { if (timer.current) clearTimeout(timer.current); };
    // Saving is triggered only by editing or changing the question.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q?.id, text, review]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (status !== "Réponse enregistrée" && status !== "Toutes les réponses reçues sont enregistrées") { e.preventDefault(); } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [status]);
  async function leave(to: "previous" | "next" | "exit") {
    if (!q) return;
    if (timer.current) clearTimeout(timer.current);
    setBusy(true);
    try {
      await persist(q.id, latest.current[q.id] ?? "", index);
      if (to === "exit") { await qc.invalidateQueries({ queryKey: ["portal-session"] }); await navigate({ to: "/espace-candidat/accueil" }); }
      else if (to === "previous") setIndex(Math.max(0, index - 1));
      else if (index + 1 < s.questions.length) setIndex(index + 1);
      else { await qc.invalidateQueries({ queryKey: ["portal-session"] }); await navigate({ to: "/espace-candidat/verification" }); }
    } catch (e) { setStatus("Sauvegarde impossible"); toast.error(e instanceof Error ? e.message : "Sauvegarde impossible"); } finally { setBusy(false); }
  }
  const complete = canSubmitInterview(s.questions, Object.entries(answers).map(([question_id, answer_text]) => ({ question_id, answer_text })));
  if (!s.consent) return <><h1 className="text-2xl font-semibold">Votre pré-entretien</h1><Button className="mt-6" onClick={() => navigate({ to: "/espace-candidat/accueil" })}>Commencer</Button></>;
  if (!q) return <p>Votre pré-entretien n’est pas encore prêt.</p>;
  return review ? <><ClipboardCheck className="mb-5 h-8 w-8 text-primary" /><h1 className="text-3xl font-semibold">Vérifiez vos réponses</h1><p className="mt-3 text-muted-foreground">Après soumission, vos réponses ne pourront plus être modifiées.</p><ol className="mt-8 divide-y border-y">{s.questions.map((question, i) => <li key={question.id} className="py-6"><div className="flex items-start justify-between gap-4"><h2 className="font-medium">{i + 1}. {question.question}</h2><Button variant="ghost" size="sm" onClick={async () => { await qc.invalidateQueries({ queryKey: ["portal-session"] }); await navigate({ to: "/espace-candidat/questionnaire", search: { question: i } }); }}>Modifier</Button></div><p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{answers[question.id]?.trim() || "Sans réponse"}</p></li>)}</ol>{!complete && <p className="mt-5 text-sm text-destructive">Répondez à toutes les questions avant de soumettre.</p>}<Button className="mt-7 h-12" disabled={!complete || busy} onClick={() => setConfirm(true)}>Soumettre mon pré-entretien<ArrowRight /></Button><AlertDialog open={confirm} onOpenChange={setConfirm}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Soumettre définitivement votre pré-entretien ?</AlertDialogTitle><AlertDialogDescription>Vos réponses seront transmises à l’équipe recrutement et ne pourront plus être modifiées.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Revenir aux réponses</AlertDialogCancel><Button disabled={busy} onClick={async () => { setBusy(true); try { await submit({ data: { confirmed: true } }); await qc.invalidateQueries({ queryKey: ["portal-session"] }); await navigate({ to: "/espace-candidat/confirmation", replace: true }); } catch (e) { toast.error(e instanceof Error ? e.message : "Soumission impossible"); } finally { setBusy(false); } }}>{busy ? "Transmission…" : "Confirmer la soumission"}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog></> : <><div className="flex flex-wrap items-center justify-between gap-3 text-sm"><span className="font-medium">Question {index + 1} sur {s.questions.length}</span><span role="status" className="text-muted-foreground">{status}</span></div><Progress value={(index + 1) / s.questions.length * 100} className="mb-9 mt-4 h-1.5" /><span className="text-sm font-medium text-primary">{q.kind === "common" ? "Question commune" : "Question personnalisée"}</span><h1 className="mt-4 text-2xl font-semibold leading-relaxed">{q.question}</h1><Label htmlFor="answer" className="sr-only">Votre réponse</Label><Textarea id="answer" className="mt-7 min-h-64 bg-card p-5 text-base" placeholder="Saisissez votre réponse ici..." maxLength={5000} value={text} disabled={busy} onChange={(e) => { revisions.current[q.id] = (revisions.current[q.id] ?? 0) + 1; setAnswers((a) => ({ ...a, [q.id]: e.target.value })); setStatus("Modifications à enregistrer…"); }} /><div className="mt-2 text-right text-xs text-muted-foreground">{text.length} / 5 000</div><div className="mt-7 flex flex-wrap justify-between gap-3"><Button variant="outline" disabled={busy || index === 0} onClick={() => leave("previous")}><ArrowLeft />Précédente</Button><Button disabled={busy} onClick={() => leave("next")}>{busy ? "Enregistrement…" : "Enregistrer et continuer"}<ArrowRight /></Button></div><Button variant="link" className="mt-7 px-0 text-muted-foreground" disabled={busy} onClick={() => leave("exit")}>Quitter et reprendre plus tard</Button></>;
}

function Confirmation({ session: s }: { session: PortalSession }) {
  return <><CheckCircle2 className="mb-6 h-12 w-12 text-primary" /><span className="text-sm font-medium text-primary">Pré-entretien transmis</span><h1 className="mt-3 text-3xl font-semibold">Merci pour vos réponses</h1><p className="mt-5 leading-relaxed text-muted-foreground">Votre pré-entretien a bien été transmis à notre équipe de recrutement.</p><dl className="mt-9 space-y-4 border-y py-6 text-sm"><div><dt className="text-muted-foreground">Poste</dt><dd className="mt-1 font-medium">{s.job.title}</dd></div><div><dt className="text-muted-foreground">Date de soumission</dt><dd className="mt-1">{s.submittedAt ? new Date(s.submittedAt).toLocaleString("fr-FR") : "—"}</dd></div></dl></>;
}