import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Upload, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { addApplication } from "@/lib/recruitment.functions";
import { prepareCv } from "@/lib/pdf";
import { CandidateLinkBox } from "./AddApplicationDialog";

type Row = { id: string; file: File; name: string; email: string; status: string; result?: { token: string; expiresAt: string } };
export function BulkCvDialog({ jobId }: { jobId: string }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const add = useServerFn(addApplication);
  const qc = useQueryClient();
  const update = (id: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => r.id === id ? { ...r, ...patch } : r));
  async function select(files: FileList | null) {
    if (!files) return;
    setBusy(true);
    const entries: Row[] = [];
    for (const file of Array.from(files)) {
      try {
        const cv = await prepareCv(file);
        const email = cv.pages.join(" ").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? "";
        entries.push({ id: crypto.randomUUID(), file, name: file.name.replace(/\.pdf$/i, "").replace(/[_-]/g, " ").slice(0, 120), email, status: "À valider" });
      } catch (e) { toast.error(`${file.name} : ${e instanceof Error ? e.message : "Lecture impossible"}`); }
    }
    setRows((rs) => [...rs, ...entries]);
    setBusy(false);
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try {
      for (const row of rows.filter((r) => !r.result)) {
        update(row.id, { status: "Import en cours…" });
        try {
          const cv = await prepareCv(row.file);
          const result = await add({ data: { jobId, fullName: row.name, email: row.email, cv, analyze: false, preserveDuplicate: true } });
          update(row.id, { result, status: result.duplicate ? "Déjà présent — CV conservé" : "CV importé — à analyser" });
        } catch (e) { update(row.id, { status: e instanceof Error ? e.message : "Échec de l’import" }); }
      }
      await qc.invalidateQueries({ queryKey: ["applications"] });
    } finally { setBusy(false); }
  }
  return <Dialog open={open} onOpenChange={(v) => { if (!busy) setOpen(v); }}>
    <DialogTrigger asChild><Button variant="outline"><Upload /> Importer des CV</Button></DialogTrigger>
    <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
      <DialogHeader><DialogTitle>Importer des CV en masse</DialogTitle><DialogDescription>Vérifiez le nom et l’email de chaque candidat. Les CV importés seront à analyser.</DialogDescription></DialogHeader>
      <Input aria-label="CV à importer" type="file" multiple accept="application/pdf,.pdf" disabled={busy} onChange={(e) => select(e.target.files)} />
      <form onSubmit={submit} className="space-y-4">
        {rows.map((r) => <div key={r.id} className="space-y-2 border-b pb-4">
          <div className="flex items-center gap-2"><span className="min-w-0 flex-1 break-all text-sm font-medium">{r.file.name}</span><Button type="button" size="icon" variant="ghost" aria-label={`Retirer ${r.file.name}`} disabled={busy} onClick={() => setRows(rows.filter((x) => x.id !== r.id))}><Trash2 /></Button></div>
          <div className="grid gap-2 sm:grid-cols-2"><Input aria-label={`Nom pour ${r.file.name}`} placeholder="Nom complet" value={r.name} required minLength={2} maxLength={120} disabled={busy || !!r.result} onChange={(e) => update(r.id, { name: e.target.value })} /><Input aria-label={`Email pour ${r.file.name}`} placeholder="Email" type="email" value={r.email} required maxLength={255} disabled={busy || !!r.result} onChange={(e) => update(r.id, { email: e.target.value })} /></div>
          <p role="status" className="text-xs text-muted-foreground">{r.status}</p>
          {r.result && <CandidateLinkBox {...r.result} />}
        </div>)}
        <Button type="submit" disabled={busy || !rows.some((r) => !r.result)}>{busy ? "Import en cours…" : `Importer ${rows.filter((r) => !r.result).length} CV`}</Button>
      </form>
    </DialogContent>
  </Dialog>;
}