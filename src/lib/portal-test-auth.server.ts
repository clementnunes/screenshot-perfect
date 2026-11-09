import { createClient } from "@supabase/supabase-js";
import { getRequest } from "@tanstack/react-start/server";
import type { Database } from "@/integrations/supabase/types";
import { readSecret } from "./runtime-env";

/** Test access always requires the recruiter's own validated session. */
export async function requirePortalTestRecruiter() {
  const authorization = getRequest().headers.get("authorization");
  const url = readSecret("SUPABASE_URL");
  const key = readSecret("SUPABASE_PUBLISHABLE_KEY");
  if (!authorization?.startsWith("Bearer ") || !url || !key) throw new Error("Connectez-vous à l’espace recruteur pour tester par e-mail seul.");
  const client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });
  const { data: user, error } = await client.auth.getUser(authorization.slice(7));
  if (error || !user.user) throw new Error("Votre session recruteur a expiré.");
  const { data: recruiter, error: roleError } = await client.rpc("is_recruiter");
  if (roleError || !recruiter) throw new Error("Test réservé aux recruteurs.");
  return client;
}