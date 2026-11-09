import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseJobDescriptionResponse, validateJobDescriptionFile } from "./job-description";

export const importJobDescription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    if (!(input instanceof FormData)) throw new Error("Fichier requis.");
    const file = input.get("file");
    if (!(file instanceof File)) throw new Error("Fichier requis.");
    validateJobDescriptionFile(file);
    return input;
  })
  .handler(async ({ data, context }) => {
    const { data: recruiter, error } = await context.supabase.rpc("is_recruiter");
    if (error || !recruiter) throw new Error("Accès réservé aux recruteurs.");
    const file = data.get("file");
    if (!(file instanceof File)) throw new Error("Fichier requis.");
    const body = new FormData();
    body.set("file", file, file.name);
    let response: Response;
    try {
      response = await fetch("https://nmudhoo.n8n-wsk.com/webhook-test/197db861-6df7-4b3b-942d-146450422c45", {
        method: "POST", body, signal: AbortSignal.timeout(90000),
      });
    } catch {
      return { ok: false as const, error: "n8n est injoignable ou n’a pas répondu à temps. Votre fiche actuelle est conservée." };
    }
    const raw = await response.text();
    if (!response.ok) {
      console.error(`Job description n8n failed [${response.status}]: ${raw}`);
      return { ok: false as const, error: response.status === 404
        ? "n8n n’écoute pas l’adresse de test. Lancez « Execute workflow » dans n8n, puis réessayez. Votre fiche actuelle est conservée."
        : `n8n a refusé l’import (${response.status}). Votre fiche actuelle est conservée.`, status: response.status, details: raw };
    }
    try {
      return { ok: true as const, sections: parseJobDescriptionResponse(JSON.parse(raw)) };
    } catch (error) {
      return { ok: false as const, error: error instanceof SyntaxError
        ? "n8n doit répondre avec les huit sections au format JSON, et non une simple confirmation de démarrage."
        : error instanceof Error ? error.message : "Réponse n8n invalide." };
    }
  });