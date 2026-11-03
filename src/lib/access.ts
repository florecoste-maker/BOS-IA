/**
 * Qui peut ouvrir quoi. L'équipe Jamaliance (administrateurs, membres) travaille
 * dans le cockpit /app ; un compte client ne voit que l'espace de son entreprise
 * (/espace), dont les données sont lues côté serveur d'après son compte, jamais
 * d'après la requête.
 */
export interface AccessActor {
  role: "admin" | "membre" | "client";
  clientId?: string;
}

export type AccessDecision =
  | { kind: "allow" }
  | { kind: "deny"; status: 403; message: string }
  | { kind: "redirect"; to: string };

/** Réservé aux administrateurs : comptes, journal, e-mail de test, réglages du serveur. */
export const ADMIN_PATHS = [
  "/app/utilisateurs",
  "/app/journal",
  "/api/utilisateurs",
  "/api/journal",
  "/api/integrations/test-email",
  "/api/reglages",
];

/** Seuls chemins ouverts à un compte client (en plus de la déconnexion, publique). */
export const CLIENT_PATHS = ["/espace", "/api/espace", "/api/compte"];

const under = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`);

export function accessFor(pathname: string, actor: AccessActor): AccessDecision {
  const isApi = pathname.startsWith("/api/");
  if (actor.role === "client") {
    if (actor.clientId && CLIENT_PATHS.some((p) => under(pathname, p))) return { kind: "allow" };
    if (isApi || !actor.clientId) {
      return { kind: "deny", status: 403, message: "Réservé à l'équipe Jamaliance" };
    }
    return { kind: "redirect", to: "/espace" };
  }
  // L'équipe n'a pas d'espace client à elle : elle consulte les clients depuis le cockpit.
  if (under(pathname, "/espace") || under(pathname, "/api/espace")) {
    return isApi ? { kind: "deny", status: 403, message: "Réservé aux comptes clients" } : { kind: "redirect", to: "/app" };
  }
  if (actor.role !== "admin" && ADMIN_PATHS.some((p) => under(pathname, p))) {
    return isApi ? { kind: "deny", status: 403, message: "Réservé aux administrateurs" } : { kind: "redirect", to: "/app" };
  }
  return { kind: "allow" };
}

/** Page d'accueil après connexion. */
export function homeFor(actor: AccessActor) {
  return actor.role === "client" ? "/espace" : "/app";
}
