// Shared authentication for the public endpoints used by n8n.
// The caller sends the shared secret N8N_WEBHOOK_SECRET either as the header
// "x-webhook-secret: <secret>" or as "Authorization: Bearer <secret>".
import { readSecret } from "./runtime-env";

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export function givenWebhookSecret(headers: Headers) {
  const direct = headers.get("x-webhook-secret")?.trim();
  if (direct) return direct;
  const auth = headers.get("authorization")?.trim() ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  return m?.[1]?.trim() ?? "";
}

export function isAuthorizedWebhook(request: Request) {
  const secret = readSecret("N8N_WEBHOOK_SECRET")?.trim();
  const given = givenWebhookSecret(request.headers);
  return !!secret && !!given && safeEqual(given, secret);
}
