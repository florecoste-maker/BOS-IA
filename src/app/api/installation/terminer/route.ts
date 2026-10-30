import {
  SECOURS,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  clearLoginFailures,
  createSessionToken,
  getAuthConfig,
  isLoginBlocked,
  isVercel,
  recordLoginFailure,
} from "@/lib/auth";
import { audit, clientIp } from "@/lib/audit";
import { ensureSessionSecret, loadPersistentEnv, quoteEnvValue, writeEnvVariables } from "@/lib/env-files";
import { redirectTo } from "@/lib/http";
import { checkInstallationCode, consumeInstallationCode } from "@/lib/installation/code";

export const dynamic = "force-dynamic";

const MIN_PASSWORD_LENGTH = 12;

function back(erreur: string, code: string) {
  return redirectTo(`/installation?${new URLSearchParams({ erreur, code })}`);
}

/**
 * Première installation : le mot de passe administrateur choisi est enregistré
 * dans `bos-ia.env` sur le serveur (jamais dans GitHub), le code est détruit,
 * et la personne entre directement dans le cockpit.
 */
export async function POST(request: Request) {
  const form = await request.formData();
  const code = String(form.get("code") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const confirmation = String(form.get("confirmation") ?? "");
  const ip = clientIp(request);

  loadPersistentEnv();
  if (getAuthConfig().password) return redirectTo("/login?installe=deja");
  if (isVercel()) return redirectTo("/installation");
  if (isLoginBlocked(`installation:${ip}`)) return back("bloque", code);
  if (!checkInstallationCode(code)) {
    recordLoginFailure(`installation:${ip}`);
    return back("code", "");
  }
  if (password.length < MIN_PASSWORD_LENGTH) return back("court", code);
  if (password !== confirmation) return back("different", code);
  if (password !== password.trim() || quoteEnvValue(password) === null) return back("caracteres", code);

  try {
    writeEnvVariables({ BOS_ADMIN_PASSWORD: password });
    ensureSessionSecret();
  } catch (error) {
    console.error("Installation : écriture impossible :", error instanceof Error ? error.message : error);
    return back("ecriture", code);
  }
  consumeInstallationCode();
  clearLoginFailures(`installation:${ip}`);

  if (!getAuthConfig().configured) return redirectTo("/login?erreur=config");
  await audit({ id: SECOURS.uid, nom: SECOURS.nom }, "installation", "cockpit", { request });

  const response = redirectTo("/app");
  response.cookies.set(SESSION_COOKIE, createSessionToken(SECOURS), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return response;
}
