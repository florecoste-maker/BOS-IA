/** Au démarrage du serveur : charge `bos-ia.env` avant la première requête. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { loadPersistentEnv } = await import("@/lib/env-files");
  loadPersistentEnv();
}
