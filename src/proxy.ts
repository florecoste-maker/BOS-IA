import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, getAuthConfig, verifySessionToken } from "@/lib/auth";
import { retryPersistentEnv } from "@/lib/env-files";
import { resolveActor } from "@/lib/session";

/**
 * Routes ouvertes sans session : connexion, sonde de santé Hostinger, et
 * déclencheur des agents planifiés et sauvegarde (protégés par le secret BOS_CRON_SECRET).
 */
const PUBLIC_API = [
  "/api/auth/login",
  "/api/auth/logout",
  "/api/health",
  "/api/agents/planifie",
  "/api/sauvegarde",
];

/** Réservé aux administrateurs : comptes, journal, e-mail de test. */
const ADMIN_PATHS = [
  "/app/utilisateurs",
  "/app/journal",
  "/api/utilisateurs",
  "/api/journal",
  "/api/integrations/test-email",
];

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_API.includes(pathname)) return NextResponse.next();

  const isApi = pathname.startsWith("/api/");
  let auth = getAuthConfig();
  if (!auth.configured) {
    // bos-ia.env créé ou corrigé après le démarrage : pris en compte sans redémarrer.
    retryPersistentEnv();
    auth = getAuthConfig();
  }

  // Fermé par défaut : sans mot de passe configuré, le cockpit reste inaccessible.
  if (!auth.configured) {
    if (isApi) {
      return NextResponse.json(
        { error: "Accès BOS-IA non configuré", problems: auth.problems },
        { status: 503 },
      );
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "?erreur=config";
    return NextResponse.redirect(url);
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  // Jeton signé puis compte relu en base à chaque requête : un compte désactivé
  // perd l'accès immédiatement (lecture par clé primaire, sans cache).
  const actor = await resolveActor(verifySessionToken(token));
  if (actor) {
    if (actor.role !== "admin" && ADMIN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
      if (isApi) return NextResponse.json({ error: "Réservé aux administrateurs" }, { status: 403 });
      const home = request.nextUrl.clone();
      home.pathname = "/app";
      home.search = "";
      return NextResponse.redirect(home);
    }
    return NextResponse.next();
  }

  if (isApi) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  }
  const login = request.nextUrl.clone();
  login.pathname = "/login";
  login.search = `?${new URLSearchParams({ next: `${pathname}${search}` })}`;
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/app", "/app/:path*", "/api/:path*"],
};
