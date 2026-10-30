/**
 * Preuve d'origine GitHub Actions, sans secret partagé : le workflow
 * « Installation du cockpit » demande à GitHub un jeton OIDC signé, que le
 * serveur vérifie avec les clés publiques de GitHub (RS256).
 *
 * Seul le workflow `installation.yml` de la branche `main` du dépôt privé
 * autorisé, lancé à la main, est accepté.
 */
import { createPublicKey, verify, type JsonWebKey } from "node:crypto";

export const OIDC_ISSUER = "https://token.actions.githubusercontent.com";
export const OIDC_AUDIENCE = "bos-ia-installation";
export const DEFAULT_REPOSITORY = "florecoste-maker/BOS-IA-Hostinger";
const WORKFLOW_FILE = ".github/workflows/installation.yml";
const KEYS_TTL_MS = 60 * 60 * 1000;

type Jwk = JsonWebKey & { kid?: string };
let keysCache: { at: number; keys: Jwk[] } | null = null;

async function githubKeys(force = false): Promise<Jwk[]> {
  if (!force && keysCache && Date.now() - keysCache.at < KEYS_TTL_MS) return keysCache.keys;
  const response = await fetch(`${OIDC_ISSUER}/.well-known/jwks`, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Clés GitHub indisponibles (HTTP ${response.status})`);
  const { keys } = (await response.json()) as { keys: Jwk[] };
  keysCache = { at: Date.now(), keys };
  return keys;
}

export function allowedRepository() {
  return (process.env.BOS_INSTALLATION_DEPOT?.trim() || DEFAULT_REPOSITORY).toLowerCase();
}

export interface OidcClaims {
  iss?: unknown;
  aud?: unknown;
  exp?: unknown;
  nbf?: unknown;
  repository?: unknown;
  repository_visibility?: unknown;
  ref?: unknown;
  event_name?: unknown;
  workflow_ref?: unknown;
  actor?: unknown;
}

/** Contrôle des revendications, séparé de la signature pour être testé. */
export function claimsProblem(claims: OidcClaims, now = Date.now()): string | null {
  const repo = allowedRepository();
  const seconds = Math.floor(now / 1000);
  if (claims.iss !== OIDC_ISSUER) return "émetteur";
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(OIDC_AUDIENCE)) return "audience";
  if (typeof claims.exp !== "number" || claims.exp <= seconds) return "jeton expiré";
  if (typeof claims.nbf === "number" && claims.nbf > seconds + 60) return "jeton pas encore valide";
  if (typeof claims.repository !== "string" || claims.repository.toLowerCase() !== repo) return "dépôt";
  if (claims.repository_visibility !== "private") return "dépôt non privé";
  if (claims.ref !== "refs/heads/main") return "branche";
  if (claims.event_name !== "workflow_dispatch") return "déclenchement";
  const workflow = `${repo}/${WORKFLOW_FILE}@refs/heads/main`;
  if (typeof claims.workflow_ref !== "string" || claims.workflow_ref.toLowerCase() !== workflow) return "workflow";
  return null;
}

/** Revendications du jeton s'il est signé par GitHub et conforme, sinon une erreur. */
export async function verifyGithubToken(token: string, now = Date.now()) {
  const [header64, payload64, signature64, extra] = token.split(".");
  if (!header64 || !payload64 || !signature64 || extra !== undefined) throw new Error("Jeton mal formé");
  const header = JSON.parse(Buffer.from(header64, "base64url").toString("utf8")) as { alg?: string; kid?: string };
  if (header.alg !== "RS256" || !header.kid) throw new Error("Algorithme non accepté");

  let jwk = (await githubKeys()).find((k) => k.kid === header.kid);
  if (!jwk) jwk = (await githubKeys(true)).find((k) => k.kid === header.kid); // rotation des clés
  if (!jwk) throw new Error("Clé de signature inconnue");

  const valid = verify(
    "RSA-SHA256",
    Buffer.from(`${header64}.${payload64}`),
    createPublicKey({ key: jwk, format: "jwk" }),
    Buffer.from(signature64, "base64url"),
  );
  if (!valid) throw new Error("Signature invalide");

  const claims = JSON.parse(Buffer.from(payload64, "base64url").toString("utf8")) as OidcClaims;
  const problem = claimsProblem(claims, now);
  if (problem) throw new Error(`Jeton refusé (${problem})`);
  return claims;
}
