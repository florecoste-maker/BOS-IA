/**
 * Accès au cockpit BOS-IA : un mot de passe administrateur, une session
 * signée (HMAC-SHA256) dans un cookie httpOnly. Aucun secret côté client.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "bos_session";
export const SESSION_TTL_SECONDS = 12 * 60 * 60;

/** Longueur minimale imposée aux secrets en production. */
const MIN_SECRET_LENGTH = 32;
const MIN_PASSWORD_LENGTH = 12;

function trimOrNull(value: string | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

export function getAuthConfig() {
  const password = trimOrNull(process.env.BOS_ADMIN_PASSWORD);
  const secret = trimOrNull(process.env.BOS_SESSION_SECRET);
  const problems = [
    !password ? "BOS_ADMIN_PASSWORD manquant" : null,
    password && password.length < MIN_PASSWORD_LENGTH
      ? `BOS_ADMIN_PASSWORD trop court (${MIN_PASSWORD_LENGTH} caractères minimum)`
      : null,
    !secret ? "BOS_SESSION_SECRET manquant" : null,
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
  return safeEqual(candidate, password);
}

export function createSessionToken(now = Date.now()) {
  const { secret, configured } = getAuthConfig();
  if (!configured || !secret) throw new Error("Authentification non configurée");
  const expiresAt = Math.floor(now / 1000) + SESSION_TTL_SECONDS;
  const payload = String(expiresAt);
  return `${payload}.${sign(payload, secret)}`;
}

export function verifySessionToken(token: string | undefined, now = Date.now()) {
  const { secret, configured } = getAuthConfig();
  if (!configured || !secret || !token) return false;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return false;
  if (!safeEqual(signature, sign(payload, secret))) return false;
  const expiresAt = Number(payload);
  return Number.isInteger(expiresAt) && expiresAt > Math.floor(now / 1000);
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
  if (value !== "/app" && !value.startsWith("/app/")) return "/app";
  return value;
}
