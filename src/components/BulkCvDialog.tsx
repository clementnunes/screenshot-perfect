import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Upload, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { addApplication, analyzeNewCvs, submitCandidateCvs } from "@/lib/recruitment.functions";
import { prepareCv } from "@/lib/pdf";
import { CandidateLinkBox } from "./AddApplicationDialog";

type Row = { id: string; file: File; name: string; email: string; status: string; result?: { token: string; expiresAt: string } };
export function BulkCvDialog({ jobId, publicMode = false }: { jobId?: string; publicMode?: boolean }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<"idle" | "reading" | "sending">("idle");
  const add = useServerFn(addApplication);
  const analyze = useServerFn(analyzeNewCvs);
  const submitPublic = useServerFn(submitCandidateCvs);
  const [done, setDone] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const qc = useQueryClient();
  const update = (id: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => r.id === id ? { ...r, ...patch } : r));
  async function select(files: FileList | null) {
    if (!files) return;
    setBusy(true); setPhase("reading");
    const entries: Row[] = [];
    for (const file of Array.from(files)) {
      try {
        const cv = await prepareCv(file);
        const email = cv.pages.join(" ").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? "";
        entries.push({ id: crypto.randomUUID(), file, name: file.name.replace(/\.pdf$/i, "").replace(/[_-]/g, " ").slice(0, 120), email, status: "À valider" });
      } catch (e) { toast.error(`${file.name} : ${e instanceof Error ? e.message : "Lecture impossible"}`); }
    }
    setRows((rs) => [...rs, ...entries]);
    setBusy(false); setPhase("idle");
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setPhase("sending");
    try {
      const pending = rows.filter((r) => !r.result);
      if (publicMode) {
        if (password.length < 8) { toast.error("Le mot de passe doit contenir au moins 8 caractères."); return; }
        if (password !== confirm) { toast.error("Les mots de passe ne correspondent pas."); return; }
        pending.forEach((r) => update(r.id, { status: "Envoi en cours…" }));
        const cvs = [];
        for (const r of pending) cvs.push({ fullName: r.name, email: r.email, cv: await prepareCv(r.file) });
        try {
          const res = await submitPublic({ data: { cvs, password } });
          pending.forEach((r, i) => update(r.id, { status: res.results[i]?.duplicate ? "Candidature déjà reçue" : "CV reçu — analyse lancée" }));
          setDone(true);
        } catch (e) { pending.forEach((r) => update(r.id, { status: e instanceof Error ? e.message : "Échec de l’envoi" })); }
        return;
      }
      const imported: string[] = [];
      for (const row of pending) {
        update(row.id, { status: "Import en cours…" });
        try {
          const cv = await prepareCv(row.file);
          const result = await add({ data: { jobId: jobId!, fullName: row.name, email: row.email, cv, analyze: false, preserveDuplicate: true } });
          update(row.id, { result, status: result.duplicate ? "Déjà présent — CV conservé" : "CV importé — analyse en cours…" });
          if (!result.duplicate) imported.push(row.id + "|" + result.applicationId);
        } catch (e) { update(row.id, { status: e instanceof Error ? e.message : "Échec de l’import" }); }
      }
      await qc.invalidateQueries({ queryKey: ["applications"] });
      if (imported.length) {
        try {
          // 1 CV → single-analysis webhook; several → ONE bulk request with the array of candidatures.
          await analyze({ data: { applicationIds: imported.map((x) => x.split("|")[1]!) } });
          imported.forEach((x) => update(x.split("|")[0]!, { status: "CV importé et analysé" }));
        } catch (e) { toast.error(e instanceof Error ? e.message : "Analyse impossible"); }
      }
      await qc.invalidateQueries({ queryKey: ["applications"] });
    } finally { setBusy(false); setPhase("idle"); }
  }
  return <Dialog open={open} onOpenChange={(v) => { if (!busy) setOpen(v); }}>
    <DialogTrigger asChild><Button variant={publicMode ? "default" : "outline"} size={publicMode ? "lg" : "default"}><Upload /> {publicMode ? "Importer un CV" : "Importer des CV"}</Button></DialogTrigger>
    <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
      <DialogHeader><DialogTitle>{publicMode ? "Envoyer votre CV" : "Importer des CV en masse"}</DialogTitle><DialogDescription>{publicMode ? "Vérifiez votre nom et votre e-mail. Votre CV sera transmis à l’équipe de recrutement et analysé automatiquement." : "Vérifiez le nom et l’email de chaque candidat. L’analyse démarre automatiquement après l’import."}</DialogDescription></DialogHeader>
      <Input aria-label="CV à importer" type="file" multiple accept="application/pdf,.pdf" disabled={busy} onChange={(e) => select(e.target.files)} />
      <form onSubmit={submit} className="space-y-4">
        {rows.map((r) => <div key={r.id} className="space-y-2 border-b pb-4">
          <div className="flex items-center gap-2"><span className="min-w-0 flex-1 break-all text-sm font-medium">{r.file.name}</span><Button type="button" size="icon" variant="ghost" aria-label={`Retirer ${r.file.name}`} disabled={busy} onClick={() => setRows(rows.filter((x) => x.id !== r.id))}><Trash2 /></Button></div>
          <div className="grid gap-2 sm:grid-cols-2"><Input aria-label={`Nom pour ${r.file.name}`} placeholder="Nom complet" value={r.name} required minLength={2} maxLength={120} disabled={busy || !!r.result} onChange={(e) => update(r.id, { name: e.target.value })} /><Input aria-label={`Email pour ${r.file.name}`} placeholder="Email" type="email" value={r.email} required maxLength={255} disabled={busy || !!r.result} onChange={(e) => update(r.id, { email: e.target.value })} /></div>
          <p role="status" className="text-xs text-muted-foreground">{r.status}</p>
          {r.result && !publicMode && <CandidateLinkBox {...r.result} />}
        </div>)}
        {publicMode && !done && <div className="space-y-2"><p className="text-sm text-muted-foreground">Choisissez un mot de passe : il vous servira à accéder à votre pré-entretien.</p><div className="grid gap-2 sm:grid-cols-2"><Input aria-label="Mot de passe" placeholder="Mot de passe (8 caractères min.)" type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={password} disabled={busy} onChange={(e) => setPassword(e.target.value)} /><Input aria-label="Confirmation du mot de passe" placeholder="Confirmez le mot de passe" type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={confirm} disabled={busy} onChange={(e) => setConfirm(e.target.value)} /></div>{confirm && password !== confirm && <p className="text-xs text-destructive">Les mots de passe ne correspondent pas.</p>}</div>}
        {publicMode && busy && <div role="status" aria-live="polite" className="flex items-start gap-3 rounded-md bg-primary-soft p-3 text-sm text-primary"><Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" /><span>{phase === "reading" ? "Lecture de votre CV en cours…" : "Envoi de votre CV en cours, cela peut prendre une minute. Ne fermez pas cette fenêtre."}</span></div>}
        <Button type="submit" disabled={busy || done || !rows.some((r) => !r.result)}>{busy && <Loader2 className="animate-spin" />}{busy ? (publicMode && phase === "reading" ? "Lecture en cours…" : "Envoi et analyse en cours…") : publicMode ? (done ? "CV envoyé" : "Envoyer mon CV") : `Importer ${rows.filter((r) => !r.result).length} CV`}</Button>
      </form>
    </DialogContent>
  </Dialog>;
}