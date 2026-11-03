/**
 * Trace des dernières tentatives de connexion et du retour sur le cockpit,
 * pour comprendre une connexion « sans effet » sans exposer de secret : ni
 * mot de passe, ni jeton, ni adresse e-mail, ni adresse IP. Mémoire du
 * processus seulement ; lue par /api/health?complet=1 (secret BOS_CRON_SECRET).
 */
export type LoginOutcome = "acceptee" | "refusee" | "bloquee";
export type SessionOutcome = "reconnue" | "absente" | "invalide" | "expiree" | "compte_inactif";

interface Trace {
  connexion?: { quand: string; resultat: LoginOutcome; type: "secours" | "compte" };
  retour?: { quand: string; chemin: string; session: SessionOutcome; apres_connexion: boolean };
}

const registry = globalThis as typeof globalThis & { __bosLoginTrace?: Trace };

function trace() {
  return (registry.__bosLoginTrace ??= {});
}

export function recordLogin(resultat: LoginOutcome, type: "secours" | "compte") {
  trace().connexion = { quand: new Date().toISOString(), resultat, type };
}

export function recordReturn(chemin: string, session: SessionOutcome, apresConnexion: boolean) {
  trace().retour = { quand: new Date().toISOString(), chemin, session, apres_connexion: apresConnexion };
}

export function loginTrace(): Trace {
  return { ...trace() };
}
