import {
  SECOURS,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  checkPassword,
  clearLoginFailures,
  createSessionToken,
  getAuthConfig,
  isLoginBlocked,
  recordLoginFailure,
  safeNextPath,
  type SessionIdentity,
} from "@/lib/auth";
import { sendAlert } from "@/lib/alerts";
import { audit, clientIp } from "@/lib/audit";
import { getRepository } from "@/lib/data";
import { redirectTo } from "@/lib/http";
import { isSecoursDisabled } from "@/lib/session";
import { verifyPassword } from "@/lib/users/password";

export const dynamic = "force-dynamic";

function backToLogin(erreur: string, next: string) {
  const query = new URLSearchParams({ erreur, next });
  return redirectTo(`/login?${query}`);
}

/**
 * Connexion par compte nominatif (e-mail + mot de passe). E-mail vide : compte
 * de secours BOS_ADMIN_PASSWORD, journalisé et signalé par alerte.
 */
export async function POST(request: Request) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const next = safeNextPath(String(form.get("next") ?? ""));
  const ip = clientIp(request);

  if (!getAuthConfig().configured) return backToLogin("config", next);
  // Limite par adresse IP et par compte visé.
  if (isLoginBlocked(ip) || (email && isLoginBlocked(`compte:${email}`))) {
    return backToLogin("bloque", next);
  }

  let identity: SessionIdentity | null = null;
  if (!email) {
    if (!isSecoursDisabled() && checkPassword(password)) identity = SECOURS;
  } else {
    const found = await (await getRepository()).findUserForLogin(email);
    if (found?.user.actif && (await verifyPassword(password, found.passwordHash))) {
      identity = { uid: found.user.id, role: found.user.role, nom: found.user.nom };
    }
  }

  if (!identity) {
    recordLoginFailure(ip);
    if (email) recordLoginFailure(`compte:${email}`);
    await audit(null, "connexion_echouee", email || "compte de secours", { request });
    return backToLogin(email ? "identifiants" : "mdp", next);
  }

  clearLoginFailures(ip);
  if (email) clearLoginFailures(`compte:${email}`);
  const actor = { id: identity.uid, nom: identity.nom };
  if (identity.uid === SECOURS.uid) {
    await audit(actor, "connexion_secours", "compte de secours", { request });
    void sendAlert(
      "Connexion avec le mot de passe de secours",
      `Une connexion au cockpit a utilisé le mot de passe partagé (BOS_ADMIN_PASSWORD) depuis l'adresse ${ip}.\n\nSi ce n'est pas vous, changez BOS_ADMIN_PASSWORD et BOS_SESSION_SECRET dans hPanel.`,
    );
  } else {
    await (await getRepository()).touchLogin(identity.uid);
    await audit(actor, "connexion", email, { request });
  }

  const response = redirectTo(next);
  response.cookies.set(SESSION_COOKIE, createSessionToken(identity), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return response;
}
