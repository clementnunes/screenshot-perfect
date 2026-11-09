import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2, Upload, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { RecruiterShell, useActiveJob } from "@/components/RecruiterShell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { COMMON_QUESTION_COUNT, PERSONALIZED_QUESTION_COUNT, weightsAreValid, weightsTotal } from "@/lib/recruitment";
import { cn } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";
import { importJobDescription } from "@/lib/job-description.functions";
import { validateJobDescriptionFile } from "@/lib/job-description";

export const Route = createFileRoute("/parametrage")({
  head: () => ({
    meta: [
      { title: "Paramétrage du recrutement | Orvane Recrutement" },
      { name: "description", content: "Configurez la fiche de poste, les critères pondérés et les questions de pré-entretien." },
      { property: "og:title", content: "Paramétrage du recrutement | Orvane Recrutement" },
      { property: "og:description", content: "Configurez la fiche de poste, les critères pondérés et les questions de pré-entretien." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <RecruiterShell>{() => <Settings />}</RecruiterShell>,
});

type Job = Tables<"jobs">;
type Crit = { id?: string; name: string; mandatory: boolean; weight: number };
type Q = { id?: string; question: string; kind: "common" | "personalized" };

function Block({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <Card className="p-6 shadow-card">
      <h2 className="text-base font-semibold">{title}</h2>
      {desc && <p className="mt-1 text-sm text-muted-foreground">{desc}</p>}
      <div className="mt-5">{children}</div>
    </Card>
  );
}

function Settings() {
  const { data: job } = useActiveJob();
  const qc = useQueryClient();
  const [form, setForm] = useState<Job | null>(null);
  const [crits, setCrits] = useState<Crit[]>([]);
  const [qs, setQs] = useState<Q[]>([]);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importedName, setImportedName] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const importFile = useServerFn(importJobDescription);

  async function uploadJobFile(file: File) {
    setImportError(null);
    setImporting(true);
    try {
      validateJobDescriptionFile(file);
      const data = new FormData();
      data.set("file", file);
      const result = await importFile({ data });
      if (!result.ok) throw new Error(result.error);
      setForm((current) => current ? { ...current, ...result.sections } : current);
      setImportedName(file.name);
      toast.success("Les huit sections sont prêtes à être modifiées.");
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Import impossible. Votre fiche actuelle est conservée.");
    } finally {
      setImporting(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  const { data: loaded } = useQuery({
    queryKey: ["job-config", job?.id],
    enabled: !!job,
    queryFn: async () => {
      if (!job) return { criteria: [], questions: [] };
      const [c, q] = await Promise.all([
        supabase.from("job_criteria").select("*").eq("job_id", job.id).order("position"),
        supabase.from("interview_questions").select("*").eq("job_id", job.id).is("application_id", null).order("position"),
      ]);
      return { criteria: c.data ?? [], questions: q.data ?? [] };
    },
  });

  useEffect(() => { if (job) setForm(job); }, [job]);
  useEffect(() => {
    if (!loaded) return;
    setCrits(loaded.criteria.map((c) => ({ id: c.id, name: c.name, mandatory: c.mandatory, weight: c.weight })));
    setQs(loaded.questions.map((q) => ({ id: q.id, question: q.question, kind: q.kind as Q["kind"] })));
  }, [loaded]);

  if (!form) return null;
  const set = (k: keyof Job) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: k === "link_validity_days" || k === "match_threshold" ? Number(e.target.value) : e.target.value });

  const total = weightsTotal(crits);
  const common = qs.filter((q) => q.kind === "common");
  const personal = qs.filter((q) => q.kind === "personalized");

  async function save() {
    if (!form) return;
    if (!weightsAreValid(crits)) { toast.error(`La somme des pondérations doit être égale à 100 % (actuellement ${total} %).`); return; }
    if (crits.some((c) => !c.name.trim())) { toast.error("Chaque critère doit avoir un intitulé."); return; }
    if (common.length !== COMMON_QUESTION_COUNT || common.some((q) => !q.question.trim())) { toast.error(`Définissez exactement ${COMMON_QUESTION_COUNT} questions communes.`); return; }
    if (personal.length !== PERSONALIZED_QUESTION_COUNT || personal.some((q) => !q.question.trim())) { toast.error(`Définissez ${PERSONALIZED_QUESTION_COUNT} consignes de questions personnalisées.`); return; }
    if (form.link_validity_days < 1 || form.link_validity_days > 90) { toast.error("La validité du lien doit être comprise entre 1 et 90 jours."); return; }
    if (!(form.match_threshold >= 0 && form.match_threshold <= 100)) { toast.error("Le seuil de correspondance doit être compris entre 0 et 100 %."); return; }
    setSaving(true);
    try {
      const { id, created_at: _c, updated_at: _u, ...rest } = form;
      const r1 = await supabase.from("jobs").update(rest).eq("id", id);
      if (r1.error) throw r1.error;

      const keepC = crits.flatMap((c) => c.id ? [c.id] : []);
      const removedC = (loaded?.criteria ?? []).filter((c) => !keepC.includes(c.id)).map((c) => c.id);
      if (removedC.length) await supabase.from("job_criteria").delete().in("id", removedC);
      const r2 = await supabase.from("job_criteria").upsert(crits.map((c, i) => ({ ...(c.id ? { id: c.id } : {}), job_id: id, name: c.name.trim(), mandatory: c.mandatory, weight: c.weight, position: i })));
      if (r2.error) throw r2.error;

      const ordered = [...common, ...personal];
      const keepQ = ordered.flatMap((q) => q.id ? [q.id] : []);
      const removedQ = (loaded?.questions ?? []).filter((q) => !keepQ.includes(q.id)).map((q) => q.id);
      if (removedQ.length) await supabase.from("interview_questions").delete().in("id", removedQ);
      const r3 = await supabase.from("interview_questions").upsert(ordered.map((q, i) => ({ ...(q.id ? { id: q.id } : {}), job_id: id, kind: q.kind, question: q.question.trim(), position: i })));
      if (r3.error) throw r3.error;

      toast.success("Paramétrage enregistré");
      qc.invalidateQueries();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  }

  const field = (k: keyof Job, label: string, area = false) => (
    <div className="space-y-1.5">
      <Label htmlFor={k}>{label}</Label>
      {area ? <Textarea id={k} rows={3} disabled={importing} value={String(form[k] ?? "")} onChange={set(k)} /> : <Input id={k} disabled={importing} value={String(form[k] ?? "")} onChange={set(k)} />}
    </div>
  );

  const qList = (kind: Q["kind"], items: Q[], max: number, hint: string) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">{kind === "common" ? "Questions communes" : "Questions personnalisées (générées à partir du CV)"} <span className="text-muted-foreground">({items.length}/{max})</span></div>
        <Button size="sm" variant="outline" disabled={items.length >= max} onClick={() => setQs([...qs, { question: "", kind }])}><Plus /> Ajouter</Button>
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
      {items.map((q) => (
        <div key={q.id ?? qs.indexOf(q)} className="flex gap-2">
          <Textarea rows={2} value={q.question} onChange={(e) => setQs(qs.map((x) => (x === q ? { ...x, question: e.target.value } : x)))} />
          <Button variant="ghost" size="icon" aria-label="Supprimer" onClick={() => setQs(qs.filter((x) => x !== q))}><Trash2 /></Button>
        </div>
      ))}
    </div>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-24">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Paramétrage du recrutement</h1>
        <p className="mt-1 text-sm text-muted-foreground">Ces éléments servent de référence à l'analyse des CV et du pré-entretien.</p>
      </div>

      <Block title="Fiche de poste">
        <div className="mb-5 space-y-3 border-b pb-5">
          <Input ref={fileInput} id="job-description-file" type="file" className="sr-only" aria-label="Fichier de fiche de poste" accept=".pdf,.doc,.docx,.txt" disabled={importing || saving} onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void uploadJobFile(file);
          }} />
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" disabled={importing || saving} onClick={() => fileInput.current?.click()}>
              {importing ? <Loader2 className="animate-spin" /> : <Upload />}
              {importing ? "Découpage par n8n…" : "Importer une fiche de poste"}
            </Button>
            <span className="text-xs text-muted-foreground">PDF, Word ou TXT · 10 Mo max.</span>
          </div>
          {importedName && <p className="break-words text-sm text-muted-foreground" role="status">{importedName} — sections importées, non enregistrées.</p>}
          {importError && <p className="text-sm text-destructive" role="alert">{importError}</p>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">{field("title", "Intitulé")}</div>
          <div className="sm:col-span-2">{field("description", "Description", true)}</div>
          <div className="sm:col-span-2">{field("missions", "Missions", true)}</div>
          {field("skills", "Compétences attendues", true)}
          {field("experience", "Expérience souhaitée", true)}
          {field("diplomas", "Diplômes ou certifications pertinents", true)}
          <div className="space-y-4">{field("location", "Localisation")}{field("contract_type", "Type de contrat")}</div>
        </div>
      </Block>

      <Block title="Critères d'évaluation" desc="La somme des pondérations doit être égale à 100 %.">
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2 font-medium">Critère</th><th className="px-3 py-2 font-medium">Obligatoire</th><th className="px-3 py-2 font-medium">Pondération</th><th /></tr></thead>
            <tbody>
              {crits.map((c, i) => (
                <tr key={c.id ?? i} className="border-t">
                  <td className="px-3 py-2"><Input value={c.name} onChange={(e) => setCrits(crits.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} /></td>
                  <td className="px-3 py-2"><Switch checked={c.mandatory} onCheckedChange={(v) => setCrits(crits.map((x, j) => (j === i ? { ...x, mandatory: v } : x)))} /></td>
                  <td className="px-3 py-2"><div className="flex items-center gap-1"><Input type="number" min={0} max={100} className="w-20" value={c.weight} onChange={(e) => setCrits(crits.map((x, j) => (j === i ? { ...x, weight: Number(e.target.value) } : x)))} /> %</div></td>
                  <td className="px-3 py-2 text-right"><Button variant="ghost" size="icon" aria-label="Supprimer" onClick={() => setCrits(crits.filter((_, j) => j !== i))}><Trash2 /></Button></td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="border-t bg-muted/30"><td className="px-3 py-2"><Button size="sm" variant="outline" onClick={() => setCrits([...crits, { name: "", mandatory: false, weight: 0 }])}><Plus /> Ajouter un critère</Button></td><td className="px-3 py-2 text-right text-xs text-muted-foreground">Total</td><td className={cn("px-3 py-2 font-semibold tabular-nums", total === 100 ? "text-success" : "text-destructive")}>{total} %</td><td /></tr></tfoot>
          </table>
        </div>
      </Block>

      <Block title="Références de pré-entretien pour n8n" desc="n8n pilote les six questions, les invitations et la sauvegarde des réponses : quatre communes et deux personnalisées selon le CV.">
        <div className="space-y-6">
          {qList("common", common, COMMON_QUESTION_COUNT, "Posées à l'identique à chaque candidat.")}
          {qList("personalized", personal, PERSONALIZED_QUESTION_COUNT, "Consignes données à l'IA : elle formule pour chaque candidat une question fondée sur une expérience précise de son CV et sur la fiche de poste.")}
        </div>
      </Block>

      <Block title="Paramètres">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="match_threshold">Seuil de correspondance pour le pré-entretien (%)</Label><Input id="match_threshold" type="number" min={0} max={100} value={form.match_threshold} onChange={set("match_threshold")} /><p className="text-xs text-muted-foreground">Au-delà de ce seuil, le profil est signalé « Pré-entretien à faire ».</p></div>
          <div className="space-y-1.5"><Label htmlFor="link_validity_days">Durée de validité du lien candidat (jours)</Label><Input id="link_validity_days" type="number" min={1} max={90} value={form.link_validity_days} onChange={set("link_validity_days")} /></div>
          {field("sender_email", "Adresse email d'expédition")}
          <div className="sm:col-span-2">{field("invitation_message", "Message d'invitation", true)}</div>
          <div className="sm:col-span-2">{field("confirmation_message", "Message de confirmation", true)}</div>
          <div className="sm:col-span-2">{field("rejection_template", "Modèle de réponse négative", true)}</div>
        </div>
      </Block>

      <div className="fixed inset-x-0 bottom-0 border-t bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-end gap-3 px-4 py-3">
          <span className={cn("text-xs", total === 100 ? "text-muted-foreground" : "text-destructive")}>Pondérations : {total} %</span>
          <Button onClick={save} disabled={saving || importing}>{saving ? "Enregistrement…" : "Enregistrer le paramétrage"}</Button>
        </div>
      </div>
    </div>
  );
}
