import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Lock, Mic, MicOff, Upload } from "lucide-react";
import { OrvaneLogo } from "@/components/RecruiterShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { completeCandidateInterview, confirmCandidateIdentity, getCandidateSession, saveCandidateAnswer, uploadCandidateCv } from "@/lib/recruitment.functions";
import { prepareCv } from "@/lib/pdf";

export const Route = createFileRoute("/candidat/$token")({
  head: () => ({
    meta: [
      { title: "Espace candidat | Groupe Orvane" },
      { name: "description", content: "Déposez votre candidature et réalisez votre pré-entretien écrit en ligne, au moment de votre choix." },
      { property: "og:title", content: "Espace candidat | Groupe Orvane" },
      { property: "og:description", content: "Déposez votre candidature et réalisez votre pré-entretien écrit en ligne." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: CandidatePage,
});

function Shell({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <div className="min-h-screen">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4">
          <OrvaneLogo />
          {title && <span className="hidden text-sm text-muted-foreground sm:block">{title}</span>}
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-8">{children}</main>
    </div>
  );
}

function CandidatePage() {
  const { token } = Route.useParams();
  const get = useServerFn(getCandidateSession);
  const { data, isLoading } = useQuery({
    queryKey: ["candidate", token],
    queryFn: () => get({ data: { token } }),
    refetchInterval: (q) => {
      const d = q.state.data;
      return d?.valid && d.hasCv && (!d.interview || d.interview.questions.length < 6 || ["pending", "extracting", "analyzing"].includes(d.analysisStatus)) ? 3000 : false;
    },
  });

  if (isLoading) return <Shell><div className="text-sm text-muted-foreground">Chargement…</div></Shell>;
  if (!data?.valid) {
    return (
      <Shell>
        <Card className="p-8 text-center shadow-card">
          <Lock className="mx-auto h-8 w-8 text-muted-foreground" />
          <h1 className="mt-4 text-lg font-semibold">Lien invalide ou expiré</h1>
          <p className="mt-2 text-sm text-muted-foreground">Ce lien n'est plus valable. Contactez l'équipe recrutement du Groupe Orvane pour en recevoir un nouveau.</p>
        </Card>
      </Shell>
    );
  }

  const step = !data.identityConfirmed || !data.hasCv ? "A" : data.interview?.status === "completed" ? "done" : "B";
  return (
    <Shell title={data.job.title}>
      {step === "A" && <StepA token={token} s={data} />}
      {step === "B" && <StepB token={token} s={data} />}
      {step === "done" && (
        <Card className="p-8 text-center shadow-card">
          <CheckCircle2 className="mx-auto h-10 w-10 text-primary" />
          <h1 className="mt-4 text-xl font-semibold">Merci, c'est terminé</h1>
          <p className="mt-2 text-sm text-muted-foreground">{data.job.confirmation}</p>
          <p className="mt-4 text-xs text-muted-foreground">Vos réponses seront examinées par un recruteur. Vous recevrez une réponse dans tous les cas.</p>
        </Card>
      )}
    </Shell>
  );
}

type Session = Extract<Awaited<ReturnType<typeof getCandidateSession>>, { valid: true }>;

function StepA({ token, s }: { token: string; s: Session }) {
  const qc = useQueryClient();
  const confirm = useServerFn(confirmCandidateIdentity);
  const upload = useServerFn(uploadCandidateCv);
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["candidate", token] });

  async function onConfirm(e: React.FormEvent) {
    e.preventDefault();
    if (!consent) { toast.error("Merci d'accepter les conditions de traitement de vos données."); return; }
    setBusy(true);
    try { await confirm({ data: { token, email, consent: true } }); refresh(); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Erreur"); }
    finally { setBusy(false); }
  }

  async function onFile(file: File) {
    setBusy(true);
    try {
      const cv = await prepareCv(file);
      const r = await upload({ data: { token, cv } });
      if (!r.ok) toast.error("Votre CV a bien été reçu, mais son analyse doit être reprise par l'équipe. Vous pourrez continuer plus tard.");
      refresh();
    } catch (err) { toast.error(err instanceof Error ? err.message : "Erreur"); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="text-xs font-medium uppercase tracking-wider text-primary">Candidature</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{s.job.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{s.job.location} · {s.job.contract}</p>
      </div>
      <Card className="p-5 shadow-card text-sm">
        <p>Bonjour {s.candidate.firstName}, {s.job.invitation}</p>
        <ol className="mt-4 grid gap-3 sm:grid-cols-3">
          {["Confirmation de votre identité", "Dépôt du CV", "Pré-entretien écrit : 6 questions"].map((t, i) => (
            <li key={t} className="rounded-md bg-muted/60 p-3"><div className="text-xs text-muted-foreground">Étape {i + 1}</div><div className="mt-1 font-medium">{t}</div></li>
          ))}
        </ol>
        <p className="mt-4 text-xs text-muted-foreground">Vous pouvez interrompre et reprendre à tout moment{s.expiresAt ? ` jusqu'au ${new Date(s.expiresAt).toLocaleDateString("fr-FR")}` : ""}.</p>
      </Card>

      {!s.identityConfirmed ? (
        <Card className="p-5 shadow-card">
          <h2 className="font-semibold">Confirmez votre identité</h2>
          <form onSubmit={onConfirm} className="mt-4 space-y-4">
            <div className="space-y-1.5"><Label htmlFor="email">Adresse email utilisée pour votre candidature</Label><Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="rounded-md border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
              <strong className="text-foreground">Données personnelles.</strong> Le Groupe Orvane traite votre CV et vos réponses dans le seul but d'évaluer votre candidature. Une IA aide les recruteurs à lire votre dossier ; elle analyse uniquement le contenu professionnel et ne prend aucune décision : chaque décision est prise par un recruteur. Ni votre voix, ni votre accent, ni vos émotions ne sont analysés. Vous disposez d'un droit d'accès, de rectification et d'effacement de vos données en écrivant à l'équipe recrutement.
            </div>
            <label className="flex items-start gap-2 text-sm"><Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5" /> J'ai lu ces informations et j'accepte le traitement de mes données pour ce recrutement.</label>
            <Button type="submit" disabled={busy}>Confirmer et continuer</Button>
          </form>
        </Card>
      ) : (
        <Card className="p-5 shadow-card">
          <h2 className="font-semibold">Déposez votre CV</h2>
          <p className="mt-1 text-sm text-muted-foreground">Format PDF, 10 Mo maximum.</p>
          <label className="mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-8 text-sm text-muted-foreground hover:border-primary hover:text-foreground">
            <Upload className="h-6 w-6" />
            {busy ? "Envoi et lecture de votre CV… (environ une minute)" : "Choisir un fichier PDF"}
            <input type="file" accept="application/pdf,.pdf" className="sr-only" disabled={busy} onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
        </Card>
      )}
    </div>
  );
}

type SpeechRec = { lang: string; continuous: boolean; interimResults: boolean; start: () => void; stop: () => void; onresult: (e: { resultIndex: number; results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void; onend: () => void };

function StepB({ token, s }: { token: string; s: Session }) {
  const qc = useQueryClient();
  const save = useServerFn(saveCandidateAnswer);
  const complete = useServerFn(completeCandidateInterview);
  const iv = s.interview;
  const questions = iv?.questions ?? [];
  const [index, setIndex] = useState(Math.min(iv?.currentIndex ?? 0, Math.max(questions.length - 1, 0)));
  const [answers, setAnswers] = useState<Record<string, { text: string; mode: "text" | "voice" }>>(() =>
    Object.fromEntries((iv?.answers ?? []).map((a) => [a.question_id, { text: a.answer_text, mode: a.input_mode as "text" | "voice" }])),
  );
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRec | null>(null);
  const [voiceSupported, setVoiceSupported] = useState(false);
  useEffect(() => { setVoiceSupported(!!((window as never as Record<string, unknown>)["SpeechRecognition"] || (window as never as Record<string, unknown>)["webkitSpeechRecognition"])); }, []);

  const q = questions[index];
  const current = q ? answers[q.id] ?? { text: "", mode: "text" as const } : null;

  // Autosave (debounced); cancelled when the candidate moves on explicitly.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!q || !current || !current.text.trim()) return;
    const t = setTimeout(() => {
      save({ data: { token, questionId: q.id, text: current.text, mode: current.mode, nextIndex: index } })
        .then((r) => setSavedAt(r.savedAt))
        .catch((error) => { setSavedAt(null); toast.error(error instanceof Error ? error.message : "Sauvegarde indisponible"); });
    }, 900);
    timer.current = t;
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.text, q?.id]);

  if (!iv || questions.length < 6 || !q || !current) {
    return (
      <Card className="p-8 text-center shadow-card">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
        <h1 className="mt-4 text-lg font-semibold">Préparation de votre pré-entretien</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Votre CV a bien été reçu. Vous recevrez une invitation lorsque votre pré-entretien sera prêt.
        </p>
      </Card>
    );
  }

  const setText = (text: string, mode: "text" | "voice" = current.mode) => setAnswers({ ...answers, [q.id]: { text, mode } });

  function toggleVoice() {
    if (!current) return;
    if (listening) { recRef.current?.stop(); return; }
    const W = window as never as Record<string, new () => SpeechRec>;
    const Ctor = W["SpeechRecognition"] || W["webkitSpeechRecognition"];
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "fr-FR"; rec.continuous = true; rec.interimResults = false;
    const base = current.text;
    let acc = "";
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) { const r = e.results[i]; if (r?.isFinal) acc += r[0].transcript + " "; }
      setText((base ? base + " " : "") + acc.trim(), "voice");
    };
    rec.onend = () => setListening(false);
    recRef.current = rec; rec.start(); setListening(true);
  }

  async function next() {
    if (!current || !q) return;
    if (!current.text.trim()) { toast.error("Merci de saisir une réponse."); return; }
    if (timer.current) clearTimeout(timer.current);
    setBusy(true);
    try {
      const isLast = index === questions.length - 1;
      await save({ data: { token, questionId: q.id, text: current.text, mode: current.mode, nextIndex: isLast ? index : index + 1 } });
      if (isLast) {
        await complete({ data: { token } });
        qc.invalidateQueries({ queryKey: ["candidate", token] });
      } else setIndex(index + 1);
    } catch (err) { toast.error(err instanceof Error ? err.message : "Erreur"); }
    finally { setBusy(false); }
  }

  const isLast = index === questions.length - 1;
  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Question {index + 1} sur {questions.length}</span>
          <span>{savedAt ? `Enregistré à ${new Date(savedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : "Sauvegarde automatique"}</span>
        </div>
        <Progress value={((index + 1) / questions.length) * 100} className="mt-2 h-1.5" />
      </div>
      <Card className="p-6 shadow-card">
        <h1 className="text-lg font-semibold leading-snug">{q.question}</h1>
        <Textarea className="mt-4 min-h-48" placeholder="Votre réponse…" value={current.text} maxLength={5000} onChange={(e) => setText(e.target.value)} />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          {voiceSupported ? (
            <Button type="button" variant="outline" size="sm" onClick={toggleVoice}>{listening ? <><MicOff /> Arrêter la dictée</> : <><Mic /> Répondre à voix haute (facultatif)</>}</Button>
          ) : <span className="text-xs text-muted-foreground">La dictée vocale n'est pas disponible sur ce navigateur.</span>}
          <div className="flex gap-2">
            {index > 0 && <Button variant="ghost" onClick={() => setIndex(index - 1)} disabled={busy}>Précédent</Button>}
            <Button onClick={next} disabled={busy}>{busy ? "Envoi…" : isLast ? "Valider mes réponses" : "Suivant"}</Button>
          </div>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">La dictée est transcrite en texte ; seul le contenu de vos réponses est pris en compte, jamais votre voix.</p>
      </Card>
    </div>
  );
}
