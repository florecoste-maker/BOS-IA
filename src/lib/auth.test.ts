import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  checkPassword,
  createSessionToken,
  getAuthConfig,
  isLoginBlocked,
  recordLoginFailure,
  safeNextPath,
  verifySessionToken,
} from "./auth";

const PASSWORD = "mot-de-passe-solide";
const SECRET = "s".repeat(40);

describe("Accès cockpit BOS-IA", () => {
  beforeEach(() => {
    process.env.BOS_ADMIN_PASSWORD = PASSWORD;
    process.env.BOS_SESSION_SECRET = SECRET;
  });
  afterEach(() => {
    delete process.env.BOS_ADMIN_PASSWORD;
    delete process.env.BOS_SESSION_SECRET;
  });

  it("refuse tout tant que la configuration est absente ou faible", () => {
    delete process.env.BOS_ADMIN_PASSWORD;
    assert.equal(getAuthConfig().configured, false);
    assert.equal(checkPassword(""), false);
    process.env.BOS_ADMIN_PASSWORD = "court";
    assert.equal(getAuthConfig().configured, false);
    process.env.BOS_ADMIN_PASSWORD = PASSWORD;
    process.env.BOS_SESSION_SECRET = "trop-court";
    assert.equal(getAuthConfig().configured, false);
  });

  it("vérifie le mot de passe", () => {
    assert.equal(checkPassword(PASSWORD), true);
    assert.equal(checkPassword(`${PASSWORD}x`), false);
  });

  it("accepte une session valide et rejette une session falsifiée ou expirée", () => {
    const now = Date.now();
    const identity = { uid: "usr-1", role: "membre" as const, nom: "Camille Martin" };
    const token = createSessionToken(identity, now);
    assert.deepEqual(verifySessionToken(token, now), identity);
    // Élévation de rôle en modifiant le jeton : signature invalide.
    const [, signature] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ u: "usr-1", r: "admin", n: "Camille Martin", exp: Math.floor(now / 1000) + 3600 }),
    ).toString("base64url");
    assert.equal(verifySessionToken(`${forged}.${signature}`, now), null);
    assert.equal(verifySessionToken(token, now + 13 * 60 * 60 * 1000), null);
    assert.equal(verifySessionToken("1234567890.abc", now), null, "ancien format refusé");
    assert.deepEqual(verifySessionToken(createSessionToken(undefined, now), now)?.uid, "secours");
    process.env.BOS_SESSION_SECRET = "t".repeat(40);
    assert.equal(verifySessionToken(token, now), null);
  });

  it("bloque après 5 échecs", () => {
    const ip = `test-${Math.random()}`;
    for (let i = 0; i < 5; i++) recordLoginFailure(ip);
    assert.equal(isLoginBlocked(ip), true);
    assert.equal(isLoginBlocked(ip, Date.now() + 16 * 60 * 1000), false);
  });

  it("ne redirige qu'à l'intérieur du cockpit", () => {
    assert.equal(safeNextPath("/app/agents"), "/app/agents");
    assert.equal(safeNextPath("https://evil.example"), "/app");
    assert.equal(safeNextPath("//evil.example"), "/app");
    assert.equal(safeNextPath("/application"), "/app");
  });
});

describe("Secret de session dérivé (Vercel)", () => {
  afterEach(() => {
    delete process.env.BOS_ADMIN_PASSWORD;
    delete process.env.BOS_SESSION_SECRET;
  });

  it("une seule variable suffit : secret stable, propre au mot de passe", () => {
    delete process.env.BOS_SESSION_SECRET;
    process.env.BOS_ADMIN_PASSWORD = PASSWORD;
    const config = getAuthConfig();
    assert.equal(config.configured, true);
    assert.ok(config.secret && config.secret.length >= 32 && config.secret !== PASSWORD);
    const token = createSessionToken(undefined);
    assert.equal(verifySessionToken(token)?.uid, "secours");
    process.env.BOS_ADMIN_PASSWORD = `${PASSWORD}-change`;
    assert.equal(verifySessionToken(token), null, "changer le mot de passe ferme les sessions");
    process.env.BOS_ADMIN_PASSWORD = "court";
    assert.deepEqual(getAuthConfig().problems, ["BOS_ADMIN_PASSWORD trop court (12 caractères minimum)"]);
  });
});
