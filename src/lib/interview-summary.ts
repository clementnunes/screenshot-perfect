// Reads the pre-interview synthesis produced by n8n.
// n8n puts the text at `synthese_globale.resume`; older payloads used `resume`
// at the root, and the app's own format uses `summary.summary`.

import type { InterviewSummary } from "./recruitment";

type Json = Record<string, unknown>;

function asRecord(value: unknown): Json | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null;
}

function asText(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function asTextList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => asText(v)).filter((v): v is string => !!v);
  const one = asText(value);
  return one ? [one] : [];
}

/** The synthesis text, wherever n8n nested it. */
const SUMMARY_PATHS: string[][] = [
  ["synthese_globale", "resume"],
  ["resume"],
  ["synthese_globale", "synthese"],
  ["synthese_globale", "texte"],
  ["synthese"],
  ["summary", "summary"],
  ["summary"],
];

/** Containers n8n may wrap its output in. */
const WRAPPERS = ["result", "data", "output", "json", "body", "output_json"];

function unwrap(payload: unknown): Json[] {
  // n8n "all items" responses are arrays; some nodes return JSON as a string.
  if (typeof payload === "string") {
    try {
      return unwrap(JSON.parse(payload));
    } catch {
      return [];
    }
  }
  if (Array.isArray(payload)) return payload.flatMap((p) => unwrap(p));
  const root = asRecord(payload);
  if (!root) return [];
  const out: Json[] = [root];
  for (const key of WRAPPERS) {
    const inner = asRecord(root[key]);
    if (inner) {
      out.push(inner);
      for (const key2 of WRAPPERS) {
        const deeper = asRecord(inner[key2]);
        if (deeper) out.push(deeper);
      }
    }
  }
  return out;
}

function pickText(scopes: Json[], paths: string[][]): string | null {
  for (const scope of scopes) {
    for (const path of paths) {
      let node: unknown = scope;
      for (const key of path) {
        node = asRecord(node)?.[key];
        if (node === undefined || node === null) break;
      }
      const text = asText(node);
      if (text) return text;
    }
  }
  return null;
}

function pickList(scopes: Json[], keys: string[]): string[] {
  for (const scope of scopes) {
    for (const key of keys) {
      const direct = asTextList(scope[key]);
      if (direct.length) return direct;
      const nested = asRecord(scope["synthese_globale"]);
      if (nested) {
        const value = asTextList(nested[key]);
        if (value.length) return value;
      }
    }
  }
  return [];
}

function firstText(row: Json, keys: string[]): string | null {
  for (const key of keys) {
    const text = asText(row[key]);
    if (text) return text;
  }
  return null;
}

function pickPerQuestion(scopes: Json[]): { question: string; assessment: string }[] {
  for (const scope of scopes) {
    for (const container of [scope, asRecord(scope["synthese_globale"])].filter(Boolean) as Json[]) {
      for (const key of ["per_question", "par_question", "questions", "details"]) {
        const rows = container[key];
        if (!Array.isArray(rows)) continue;
        const mapped = rows
          .map((row) => {
            const r = asRecord(row);
            if (!r) return null;
            const question = firstText(r, ["question", "intitule", "label"]);
            const assessment = firstText(r, ["assessment", "analyse", "evaluation", "commentaire", "comment"]);
            return question && assessment ? { question, assessment } : null;
          })
          .filter((r): r is { question: string; assessment: string } => !!r);
        if (mapped.length) return mapped;
      }
    }
  }
  return [];
}

/**
 * Builds the app's summary shape from whatever n8n returned, or null when the
 * payload carries no synthesis text.
 */
export function extractInterviewSummary(payload: unknown): InterviewSummary | null {
  const scopes = unwrap(payload);
  if (!scopes.length) return null;
  const summary = pickText(scopes, SUMMARY_PATHS);
  if (!summary) return null;
  return {
    summary,
    strengths: pickList(scopes, ["points_forts", "points_étayés", "strengths", "forces"]),
    points_to_verify: pickList(scopes, ["points_a_verifier", "points_à_vérifier", "a_verifier", "à_vérifier", "ecarts", "points_to_verify"]),
    per_question: pickPerQuestion(scopes),
  };
}

/** True when the payload carries a synthesis n8n can hand back. */
export function hasInterviewSummary(payload: unknown): boolean {
  return extractInterviewSummary(payload) !== null;
}

/**
 * "Analysing" only counts while it is recent: n8n answers in about half a
 * minute, so an older flag means the run was lost and the recruiter must be
 * able to ask again instead of watching a permanent spinner.
 */
export function isSummaryGenerating(
  analysisStatus: string | null | undefined,
  updatedAt: string | null | undefined,
  now: number = Date.now(),
  windowMinutes = 3,
): boolean {
  if (analysisStatus !== "analyzing") return false;
  const started = updatedAt ? Date.parse(updatedAt) : NaN;
  if (!Number.isFinite(started)) return false;
  return now - started <= windowMinutes * 60_000;
}
