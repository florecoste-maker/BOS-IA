/** Au démarrage du serveur : charge `bos-ia.env` avant la première requête. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { loadPersistentEnv } = await import("@/lib/env-files");
  loadPersistentEnv();
  scheduleBackups();
}

const UNE_MINUTE = 60_000;
const SIX_HEURES = 6 * 60 * UNE_MINUTE;

/**
 * Copie quotidienne de la base SQLite faite par le serveur lui-même, en plus du passage
 * quotidien du workflow GitHub : une minute après le démarrage, puis toutes les 6 heures
 * tant que le processus tourne. Une seule copie par jour (les passages suivants ne font
 * que la revérifier). Sans base SQLite : rien.
 */
function scheduleBackups() {
  const passage = async () => {
    try {
      const { getDatabaseEngine } = await import("@/lib/db/config");
      if (getDatabaseEngine() !== "sqlite") return;
      const { backupStatus, runDailyBackup } = await import("@/lib/db/sauvegardes");
      const today = new Date().toISOString().slice(0, 10);
      if (backupStatus().derniere?.jour === today) return;
      const result = await runDailyBackup();
      console.log(`[sauvegarde] ${result.message} : ${result.fichier ?? ""}`);
    } catch (error) {
      console.error("[sauvegarde] échec de la copie quotidienne", error);
    }
  };
  setTimeout(passage, UNE_MINUTE).unref?.();
  setInterval(passage, SIX_HEURES).unref?.();
}
