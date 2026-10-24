import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  checkPassword,
  clearLoginFailures,
  createSessionToken,
  getAuthConfig,
  isLoginBlocked,
  recordLoginFailure,
  safeNextPath,
} from "@/lib/auth";
import { redirectTo } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Dernière entrée de X-Forwarded-For : celle ajoutée par le proxy Hostinger. */
function clientIp(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() ||
    request.headers.get("x-real-ip") ||
    "inconnue"
  );
}

function backToLogin(erreur: string, next: string) {
  const query = new URLSearchParams({ erreur, next });
  return redirectTo(`/login?${query}`);
}

export async function POST(request: Request) {
  const form = await request.formData();
  const password = String(form.get("password") ?? "");
  const next = safeNextPath(String(form.get("next") ?? ""));
  const ip = clientIp(request);

  if (!getAuthConfig().configured) return backToLogin("config", next);
  if (isLoginBlocked(ip)) return backToLogin("bloque", next);

  if (!checkPassword(password)) {
    recordLoginFailure(ip);
    return backToLogin("mdp", next);
  }

  clearLoginFailures(ip);
  const response = redirectTo(next);
  response.cookies.set(SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return response;
}
