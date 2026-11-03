import { NextResponse, type NextRequest } from "next/server";
import { accessFor } from "@/lib/access";
import { LOGIN_MARK, SESSION_COOKIE, getAuthConfig, sessionTokenStatus, verifySessionToken } from "@/lib/auth";
import { NO_STORE } from "@/lib/http";
import { recordReturn } from "@/lib/login-trace";
import { retryPersistentEnv } from "@/lib/env-files";
import { resolveActor } from "@/lib/session";

/**
 * Routes ouvertes sans session : connexion, sonde de santé Hostinger, et
 * déclencheur des agents planifiés et sauvegarde (protégés par le secret BOS_CRON_SECRET),
 * installation (jeton OIDC GitHub, puis code à usage unique).
 */
const PUBLIC_API = [
  "/api/auth/login",
  "/api/auth/logout",
  "/api/health",
  "/api/agents/planifie",
  "/api/sauvegarde",
  "/api/installation",
  "/api/installation/terminer",
];

/** Aucune réponse liée à la session n'est gardée en cache (navigateur, CDN Hostinger). */
function noStore<T extends NextResponse>(response: T): T {
  response.headers.set("Cache-Control", NO_STORE);
  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  // bos-ia.env créé ou complété après le démarrage : pris en compte sans redémarrer.
  retryPersistentEnv();
  if (PUBLIC_API.includes(pathname)) return NextResponse.next();

  const isApi = pathname.startsWith("/api/");
  const auth = getAuthConfig();

  // Fermé par défaut : sans mot de passe configuré, le cockpit reste inaccessible.
  if (!auth.configured) {
    if (isApi) {
      return noStore(
        NextResponse.json({ error: "Accès BOS-IA non configuré", problems: auth.problems }, { status: 503 }),
      );
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "?erreur=config";
    return noStore(NextResponse.redirect(url));
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  // Jeton signé puis compte relu en base à chaque requête : un compte désactivé
  // perd l'accès immédiatement (lecture par clé primaire, sans cache).
  const identity = verifySessionToken(token);
  const actor = await resolveActor(identity);
  const apresConnexion = request.nextUrl.searchParams.get(LOGIN_MARK) === "1";
  if (!isApi) {
    const statut = sessionTokenStatus(token);
    recordReturn(pathname, actor ? "reconnue" : statut === "valide" ? "compte_inactif" : statut, apresConnexion);
  }
  if (actor) {
    // Rôle et espace relus en base : un compte client ne sort jamais de son espace.
    const decision = accessFor(pathname, actor);
    if (decision.kind === "allow" && apresConnexion && !isApi) {
      // Session bien reçue : adresse nettoyée (un favori ne garde pas la marque).
      const clean = request.nextUrl.clone();
      clean.searchParams.delete(LOGIN_MARK);
      return noStore(NextResponse.redirect(clean));
    }
    if (decision.kind === "allow") return NextResponse.next();
    if (decision.kind === "deny") {
      if (isApi) return noStore(NextResponse.json({ error: decision.message }, { status: decision.status }));
      return noStore(new NextResponse(decision.message, { status: decision.status }));
    }
    const home = request.nextUrl.clone();
    home.pathname = decision.to;
    home.search = "";
    return noStore(NextResponse.redirect(home));
  }

  if (isApi) {
    return noStore(NextResponse.json({ error: "Authentification requise" }, { status: 401 }));
  }
  const login = request.nextUrl.clone();
  login.pathname = "/login";
  // Connexion acceptée mais aucune session au retour : le dire au lieu de réafficher le formulaire vide.
  const sansSession = apresConnexion ? (token ? "session" : "cookie") : null;
  const params = new URLSearchParams({ next: pathname });
  if (sansSession) params.set("erreur", sansSession);
  else params.set("next", `${pathname}${search}`);
  login.search = `?${params}`;
  return noStore(NextResponse.redirect(login));
}

export const config = {
  matcher: ["/app", "/app/:path*", "/espace", "/espace/:path*", "/api/:path*"],
};
