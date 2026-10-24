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
    const token = createSessionToken(now);
    assert.equal(verifySessionToken(token, now), true);
    const [payload, signature] = token.split(".");
    assert.equal(verifySessionToken(`${Number(payload) + 3600}.${signature}`, now), false);
    assert.equal(verifySessionToken(token, now + 13 * 60 * 60 * 1000), false);
    process.env.BOS_SESSION_SECRET = "t".repeat(40);
    assert.equal(verifySessionToken(token, now), false);
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
