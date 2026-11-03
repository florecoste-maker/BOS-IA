/**
 * Accès au cockpit BOS-IA : un mot de passe administrateur, une session
 * signée (HMAC-SHA256) dans un cookie httpOnly. Aucun secret côté client.
 */
import { createHash, createHmac, scryptSync, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "bos_session";
export const SESSION_TTL_SECONDS = 12 * 60 * 60;

/** Longueur minimale imposée aux secrets en production. */
const MIN_SECRET_LENGTH = 32;
const MIN_PASSWORD_LENGTH = 12;

function trimOrNull(value: string | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

let derived: { password: string; secret: string } | null = null;

/**
 * Secret de session dérivé du mot de passe (scrypt, lent à essayer hors ligne)
 * quand BOS_SESSION_SECRET n'existe pas : sur Vercel, sans disque persistant,
 * une seule variable suffit. Changer le mot de passe invalide les sessions.
 */
function derivedSessionSecret(password: string) {
  if (derived?.password !== password) {
    derived = { password, secret: scryptSync(password, "bos-ia:session:v1", 32).toString("base64url") };
  }
  return derived.secret;
}

/** Hébergé sur Vercel : réglages dans le projet Vercel, pas de disque persistant. */
export function isVercel() {
  return Boolean(process.env.VERCEL);
}

export function getAuthConfig() {
  const password = trimOrNull(process.env.BOS_ADMIN_PASSWORD);
  const strongPassword = password && password.length >= MIN_PASSWORD_LENGTH ? password : null;
  const secret =
    trimOrNull(process.env.BOS_SESSION_SECRET) ?? (strongPassword ? derivedSessionSecret(strongPassword) : null);
  const problems = [
    !password ? "BOS_ADMIN_PASSWORD manquant" : null,
    password && !strongPassword
      ? `BOS_ADMIN_PASSWORD trop court (${MIN_PASSWORD_LENGTH} caractères minimum)`
      : null,
    secret && secret.length < MIN_SECRET_LENGTH
      ? `BOS_SESSION_SECRET trop court (${MIN_SECRET_LENGTH} caractères minimum)`
      : null,
  ].filter(Boolean) as string[];

  return { password, secret, configured: problems.length === 0, problems };
}

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string) {
  // Compare des empreintes de taille fixe : pas de fuite de longueur ni de timing.
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function checkPassword(candidate: string) {
  const { password, configured } = getAuthConfig();
  if (!configured || !password) return false;
  // Le mot de passe enregistré est lu sans espaces autour (getAuthConfig) : même règle pour la saisie.
  return safeEqual(candidate.trim(), password);
}

/** Identité portée par la session (signée, non modifiable par le navigateur). */
export interface SessionIdentity {
  /** Id du compte, ou « secours » pour le mot de passe partagé BOS_ADMIN_PASSWORD. */
  uid: string;
  role: "admin" | "membre" | "client";
  nom: string;
}

/**
 * Identifiant sous lequel le trousseau (iCloud, gestionnaire de mots de passe)
 * range le mot de passe administrateur : le même sur la page d'installation et
 * sur le formulaire de secours, sinon le mot de passe enregistré n'est jamais
 * proposé à la connexion. Valeur historique de la page d'installation, gardée
 * pour retrouver les mots de passe déjà enregistrés.
 */
export const KEYCHAIN_USERNAME = "administrateur";

export const SECOURS: SessionIdentity = { uid: "secours", role: "admin", nom: "Compte de secours" };

export function createSessionToken(identity: SessionIdentity = SECOURS, now = Date.now()) {
  const { secret, configured } = getAuthConfig();
  if (!configured || !secret) throw new Error("Authentification non configurée");
  const exp = Math.floor(now / 1000) + SESSION_TTL_SECONDS;
  const payload = Buffer.from(
    JSON.stringify({ u: identity.uid, r: identity.role, n: identity.nom, exp }),
    "utf8",
  ).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

/** Identité de la session si le jeton est authentique et non expiré, sinon null. */
export function verifySessionToken(token: string | undefined, now = Date.now()): SessionIdentity | null {
  const { secret, configured } = getAuthConfig();
  if (!configured || !secret || !token) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  if (!safeEqual(signature, sign(payload, secret))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      u?: unknown;
      r?: unknown;
      n?: unknown;
      exp?: unknown;
    };
    if (typeof data.exp !== "number" || data.exp <= Math.floor(now / 1000)) return null;
    if (typeof data.u !== "string" || typeof data.n !== "string") return null;
    if (data.r !== "admin" && data.r !== "membre" && data.r !== "client") return null;
    return { uid: data.u, role: data.r, nom: data.n };
  } catch {
    return null;
  }
}

/** Raison d'un refus de session (diagnostic) : jamais le contenu du jeton. */
export function sessionTokenStatus(token: string | undefined, now = Date.now()): "absente" | "invalide" | "expiree" | "valide" {
  if (!token) return "absente";
  if (verifySessionToken(token, now)) return "valide";
  const { secret } = getAuthConfig();
  const [payload, signature] = token.split(".");
  if (!secret || !payload || !signature || !safeEqual(signature, sign(payload, secret))) return "invalide";
  return "expiree";
}

/** Marque ajoutée à l'adresse de destination après une connexion acceptée. */
export const LOGIN_MARK = "connecte";

/** Destination après connexion, marquée : un retour sans session se voit (cookie refusé par le navigateur). */
export function markedLanding(path: string) {
  const url = new URL(path, "http://cockpit.invalid");
  url.searchParams.set(LOGIN_MARK, "1");
  return `${url.pathname}${url.search}`;
}

/** Limite les essais de mot de passe : 5 échecs par IP et par quart d'heure. */
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 5;
const failures = new Map<string, { count: number; since: number }>();

export function isLoginBlocked(ip: string, now = Date.now()) {
  const entry = failures.get(ip);
  if (!entry) return false;
  if (now - entry.since > LOGIN_WINDOW_MS) {
    failures.delete(ip);
    return false;
  }
  return entry.count >= LOGIN_MAX_FAILURES;
}

export function recordLoginFailure(ip: string, now = Date.now()) {
  const entry = failures.get(ip);
  if (!entry || now - entry.since > LOGIN_WINDOW_MS) {
    failures.set(ip, { count: 1, since: now });
  } else {
    entry.count += 1;
  }
}

export function clearLoginFailures(ip: string) {
  failures.delete(ip);
}

/** Chemin de retour après connexion : uniquement interne au cockpit. */
export function safeNextPath(value: string | null | undefined) {
  if (!value || value.includes("\\")) return "/app";
  const inside = (base: string) => value === base || value.startsWith(`${base}/`);
  if (!inside("/app") && !inside("/espace")) return "/app";
  return value;
}

/** Destination après connexion, dans la zone du rôle (cockpit ou espace client). */
export function landingPath(role: SessionIdentity["role"], next: string) {
  const zone = role === "client" ? "/espace" : "/app";
  return next === zone || next.startsWith(`${zone}/`) ? next : zone;
}
