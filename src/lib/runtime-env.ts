// Server-only: secrets bound by the hosting runtime (Worker `env`) for the current isolate.
// process.env is not always populated with them online, so src/server.ts records them here.

let workerEnv: Record<string, unknown> = {};

export function setWorkerEnv(env: unknown) {
  if (env && typeof env === "object") workerEnv = env as Record<string, unknown>;
}

export function readSecret(name: string): string | undefined {
  const fromWorker = workerEnv[name];
  if (typeof fromWorker === "string" && fromWorker) return fromWorker;
  const fromProcess = typeof process !== "undefined" ? process.env?.[name] : undefined;
  return fromProcess || undefined;
}
