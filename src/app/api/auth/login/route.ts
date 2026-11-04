import {
  SECOURS,
  isOwnerIdentifier,
  ownerEmail,
  ownerIdentity,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  checkPassword,
  clearLoginFailures,
  createSessionToken,
  getAuthConfig,
  isLoginBlocked,
  landingPath,
  markedLanding,
  recordLoginFailure,
  safeNextPath,
  type SessionIdentity,
} from "@/lib/auth";
import { sendAlert } from "@/lib/alerts";
import { audit, clientIp } from "@/lib/audit";
import { getRepository } from "@/lib/data";
import { redirectTo } from "@/lib/http";
import { recordLogin } from "@/lib/login-trace";
import { isSecoursDisabled } from "@/lib/session";
import { verifyPassword } from "@/lib/users/password";

export const dynamic = "force-dynamic";

function backToLogin(erreur: string, next: string, mode?: "secours" | "compte") {
  const query = new URLSearchParams({ erreur, next, ...(mode ? { mode } : {}) });
  return redirectTo(`/login?${query}`);
}

/**
 * Connexion par e-mail + mot de passe.
 * - Adresse de l'administratrice principale (BOS_ADMIN_EMAIL, contact@jamaliance.com),
 *   « administrateur » (trousseau) ou champ vide : mot de passe administrateur
 *   (BOS_ADMIN_PASSWORD, ~/bos-ia.env). Rien à créer, rien qui disparaisse au
 *   redémarrage. Si un compte MySQL porte aussi cette adresse, son propre mot de
 *   passe est accepté.
 * - Autre adresse : compte nominatif en base (équipe, clients).
 * Ancien formulaire « secours » (mode=secours) : l'e-mail est ignoré.
 */
export async function POST(request: Request) {
  const form = await request.formData();
  const secoursDemande = String(form.get("mode") ?? "") === "secours";
  const saisi = secoursDemande ? "" : String(form.get("email") ?? "").trim().toLowerCase();
  const proprietaire = isOwnerIdentifier(saisi);
  // Clé du compteur d'essais : l'adresse de l'administratrice pour tous ses identifiants.
  const email = proprietaire ? (saisi ? ownerEmail() : "") : saisi;
  const password = String(form.get("password") ?? "");
  const next = safeNextPath(String(form.get("next") ?? ""));
  const ip = clientIp(request);

  if (!getAuthConfig().configured) return backToLogin("config", next);
  // Limite par adresse IP et par compte visé.
  if (isLoginBlocked(ip) || (email && isLoginBlocked(`compte:${email}`))) {
    recordLogin("bloquee", email ? "compte" : "secours");
    return backToLogin("bloque", next);
  }

  let identity: SessionIdentity | null = null;
  if (email) {
    // Base indisponible (mode démonstration ou panne) : l'administratrice entre quand même.
    const found = await (await getRepository())
      .findUserForLogin(email)
      .catch(() => null);
    if (found?.user.actif && (await verifyPassword(password, found.passwordHash))) {
      identity = { uid: found.user.id, role: found.user.role, nom: found.user.nom };
    }
  }
  if (!identity && proprietaire && !isSecoursDisabled() && checkPassword(password)) identity = ownerIdentity();

  if (!identity) {
    recordLoginFailure(ip);
    if (email) recordLoginFailure(`compte:${email}`);
    recordLogin("refusee", email ? "compte" : "secours");
    await audit(null, "connexion_echouee", email || "compte de secours", { request });
    return backToLogin(proprietaire ? "mdp" : "identifiants", next);
  }

  clearLoginFailures(ip);
  if (email) clearLoginFailures(`compte:${email}`);
  const actor = { id: identity.uid, nom: identity.nom };
  if (identity.uid === SECOURS.uid) {
    await audit(actor, "connexion_secours", identity.nom, { request });
    void sendAlert(
      "Connexion administrateur au cockpit",
      `Connexion de ${identity.nom} avec le mot de passe administrateur depuis l'adresse ${ip}.\n\nSi ce n'est pas vous : GitHub → BOS-IA-Hostinger → Actions → « Installation du cockpit » → « Mot de passe administrateur oublié ».`,
    );
  } else {
    await (await getRepository()).touchLogin(identity.uid);
    await audit(actor, "connexion", email, { request });
  }

  recordLogin("acceptee", identity.uid === SECOURS.uid ? "secours" : "compte");
  const response = redirectTo(markedLanding(landingPath(identity.role, next)));
  response.cookies.set(SESSION_COOKIE, createSessionToken(identity), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return response;
}
