import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addApplication } from "@/lib/recruitment.functions";
import { prepareCv } from "@/lib/pdf";

export function CandidateLinkBox({ token, expiresAt }: { token: string; expiresAt: string }) {
  const url = typeof window !== "undefined" ? `${window.location.origin}/candidat/${token}` : "";
  return (
    <div className="space-y-2 rounded-md border bg-muted/50 p-3">
      <div className="text-xs font-medium">Lien candidat individuel</div>
      <div className="flex gap-2">
        <Input readOnly value={url} className="h-8 bg-card text-xs" onFocus={(e) => e.currentTarget.select()} />
        <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(url).then(() => toast.success("Lien copié"))}>
          <Copy /> Copier
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Valable jusqu'au {new Date(expiresAt).toLocaleDateString("fr-FR")}. Ce lien n'est affiché qu'une fois ; vous pourrez en générer un nouveau.
      </p>
    </div>
  );
}

export function AddApplicationDialog({ jobId }: { jobId: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ token: string; expiresAt: string } | null>(null);
  const add = useServerFn(addApplication);
  const qc = useQueryClient();

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const file = fd.get("cv") as File | null;
    setBusy(true);
    try {
      const cv = file && file.size > 0 ? await prepareCv(file) : undefined;
      const r = await add({ data: { jobId, fullName: String(fd.get("name")), email: String(fd.get("email")), cv } });
      if (r.duplicate) toast.info("Ce candidat avait déjà postulé : un nouveau lien a été généré.");
      setResult(r);
      qc.invalidateQueries({ queryKey: ["applications"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setResult(null); }}>
      <DialogTrigger asChild>
        <Button><Plus /> Ajouter une candidature</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajouter une candidature</DialogTitle>
          <DialogDescription>Le CV est facultatif : le candidat pourra le déposer depuis son lien.</DialogDescription>
        </DialogHeader>
        {result ? (
          <CandidateLinkBox {...result} />
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5"><Label htmlFor="name">Nom complet</Label><Input id="name" name="name" required minLength={2} maxLength={120} /></div>
            <div className="space-y-1.5"><Label htmlFor="cemail">Email</Label><Input id="cemail" name="email" type="email" required maxLength={255} /></div>
            <div className="space-y-1.5"><Label htmlFor="cv">CV (PDF)</Label><Input id="cv" name="cv" type="file" accept="application/pdf,.pdf" /></div>
            <Button type="submit" className="w-full" disabled={busy}>{busy ? "Enregistrement et analyse…" : "Enregistrer"}</Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
