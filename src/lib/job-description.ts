import { z } from "zod";

export const JOB_DESCRIPTION_WEBHOOK_URL = "https://nmudhoo.n8n-wsk.com/webhook/197db861-6df7-4b3b-942d-146450422c45";

export const JOB_DESCRIPTION_FIELDS = [
  ["title", "Intitulé"],
  ["description", "Description"],
  ["missions", "Missions"],
  ["skills", "Compétences attendues"],
  ["experience", "Expérience souhaitée"],
  ["diplomas", "Diplômes ou certifications pertinents"],
  ["location", "Localisation"],
  ["contract_type", "Type de contrat"],
] as const;

const section = z.union([z.string().max(20000), z.array(z.string().max(2000)).max(100)]).transform((v) => Array.isArray(v) ? v.join("\n") : v);
export const jobDescriptionSchema = z.object({
  title: section, description: section, missions: section, skills: section,
  experience: section, diplomas: section, location: section, contract_type: section,
}).refine((v) => v.title.trim().length > 0, "Intitulé manquant");

export type JobDescription = z.infer<typeof jobDescriptionSchema>;

const aliases: Record<keyof JobDescription, string[]> = {
  title: ["title", "intitule", "intitule_du_poste"],
  description: ["description"],
  missions: ["missions"],
  skills: ["skills", "competences_attendues", "competences"],
  experience: ["experience", "experience_souhaitee", "experiencce_souhaitee"],
  diplomas: ["diplomas", "diplomes_ou_certifications_pertinents", "diplomes_certifications", "diplomes"],
  location: ["location", "localisation"],
  contract_type: ["contract_type", "type_de_contrat", "type_contrat"],
};

export function parseJobDescriptionResponse(value: unknown): JobDescription {
  let candidate = value;
  for (let depth = 0; depth < 5; depth++) {
    if (typeof candidate === "string") {
      try { candidate = JSON.parse(candidate.replace(/^```(?:json)?\s*|\s*```$/g, "")); } catch { break; }
    } else if (Array.isArray(candidate) && candidate.length === 1) {
      candidate = candidate[0];
    } else if (candidate && typeof candidate === "object") {
      const object = candidate as Record<string, unknown>;
      const wrapper = ["sections", "data", "output", "json"].find((key) => key in object);
      if (!wrapper) break;
      candidate = object[wrapper];
    } else break;
  }
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error("n8n doit renvoyer les huit sections de la fiche de poste.");
  const entries = Object.entries(candidate).map(([key, content]) => [key.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "_"), content] as const);
  const normalized = Object.fromEntries(entries);
  const mapped = Object.fromEntries(JOB_DESCRIPTION_FIELDS.map(([key]) => [key, normalized[aliases[key].find((alias) => alias in normalized) ?? key]]));
  const result = jobDescriptionSchema.safeParse(mapped);
  if (!result.success) throw new Error("Réponse n8n incomplète ou invalide : les huit sections sont requises (texte ou liste de textes).");
  return result.data;
}

/** Columns the read endpoint may expose: the eight sections plus identity and freshness. */
export const JOB_DESCRIPTION_COLUMNS = "id, updated_at, title, description, missions, skills, experience, diplomas, location, contract_type";

export type JobDescriptionRow = { id?: string | null; updated_at?: string | null } & Partial<Record<keyof JobDescription, string | null>>;

/** Shapes a jobs row into the payload n8n receives: only the eight sections, never the email templates. */
export function jobDescriptionPayload(job: JobDescriptionRow): { job_id: string | null; updated_at: string | null } & JobDescription {
  const sections = Object.fromEntries(JOB_DESCRIPTION_FIELDS.map(([key]) => [key, job[key] ?? ""])) as JobDescription;
  return { job_id: job.id ?? null, ...sections, updated_at: job.updated_at ?? null };
}

export function validateJobDescriptionFile(file: File) {
  if (!/\.(pdf|docx?|txt)$/i.test(file.name)) throw new Error("Formats acceptés : PDF, Word ou TXT.");
  if (file.size === 0) throw new Error("Le fichier est vide.");
  if (file.size > 10 * 1024 * 1024) throw new Error("Fichier trop volumineux (10 Mo maximum).");
}