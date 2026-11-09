// Shared authentication for the public endpoints used by n8n.
// Every caller must send the header "x-webhook-secret" equal to N8N_WEBHOOK_SECRET.

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export function isAuthorizedWebhook(request: Request) {
  const secret = process.env["N8N_WEBHOOK_SECRET"];
  const given = request.headers.get("x-webhook-secret") ?? "";
  return !!secret && safeEqual(given, secret);
}
