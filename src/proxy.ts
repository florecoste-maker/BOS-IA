import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, getAuthConfig, verifySessionToken } from "@/lib/auth";

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

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_API.includes(pathname)) return NextResponse.next();

  const isApi = pathname.startsWith("/api/");
  const auth = getAuthConfig();

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
  if (verifySessionToken(token)) return NextResponse.next();

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
