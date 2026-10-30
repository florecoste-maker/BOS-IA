import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { ensureSessionSecret, findEnvFiles, persistentDir, readEnvFile, writeEnvVariables } from "../env-files";
import { checkInstallationCode, consumeInstallationCode, ensureInstallationCode, issueInstallationCode } from "./code";
import { OIDC_AUDIENCE, OIDC_ISSUER, claimsProblem } from "./github-oidc";

const NOW = Date.UTC(2026, 9, 30, 12);
const validClaims = {
  iss: OIDC_ISSUER,
  aud: OIDC_AUDIENCE,
  exp: NOW / 1000 + 300,
  repository: "florecoste-maker/BOS-IA-Hostinger",
  repository_visibility: "private",
  ref: "refs/heads/main",
  event_name: "workflow_dispatch",
  workflow_ref: "florecoste-maker/BOS-IA-Hostinger/.github/workflows/installation.yml@refs/heads/main",
};

describe("Jeton GitHub de l'installation", () => {
  it("accepte uniquement le workflow d'installation du dépôt privé, sur main", () => {
    assert.equal(claimsProblem(validClaims, NOW), null);
    assert.equal(claimsProblem({ ...validClaims, aud: "autre" }, NOW), "audience");
    assert.equal(claimsProblem({ ...validClaims, exp: NOW / 1000 - 1 }, NOW), "jeton expiré");
    assert.equal(claimsProblem({ ...validClaims, repository: "pirate/BOS-IA-Hostinger" }, NOW), "dépôt");
    assert.equal(claimsProblem({ ...validClaims, repository_visibility: "public" }, NOW), "dépôt non privé");
    assert.equal(claimsProblem({ ...validClaims, ref: "refs/heads/test" }, NOW), "branche");
    assert.equal(claimsProblem({ ...validClaims, event_name: "push" }, NOW), "déclenchement");
    assert.equal(
      claimsProblem({ ...validClaims, workflow_ref: validClaims.workflow_ref.replace("installation", "ci") }, NOW),
      "workflow",
    );
  });
});

describe("Réglages persistants écrits par le serveur", () => {
  let root: string;
  let app: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), "bos-installation-"));
    app = path.join(root, "domains", "bos.jamaliance.com", "hbuilds", "versions", "v1", "nodejs");
    mkdirSync(app, { recursive: true });
    delete process.env.BOS_SESSION_SECRET;
    delete process.env.BOS_TEST_VALEUR;
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    delete process.env.BOS_SESSION_SECRET;
    delete process.env.BOS_TEST_VALEUR;
  });

  it("écrit à la racine du compte, relu depuis le dossier de l'application", () => {
    assert.equal(persistentDir(app), root);
    const file = writeEnvVariables({ BOS_TEST_VALEUR: "a#b c'd" }, app);
    assert.equal(file, path.join(root, "bos-ia.env"));
    assert.equal(statSync(file).mode & 0o777, 0o600);
    assert.equal(readEnvFile(file).BOS_TEST_VALEUR, "a#b c'd");
    assert.deepEqual(findEnvFiles(app).map((f) => f.file), [file]);
    writeEnvVariables({ BOS_TEST_VALEUR: "nouvelle" }, app);
    assert.equal(readFileSync(file, "utf8").match(/BOS_TEST_VALEUR/g)?.length, 1);
    assert.equal(readEnvFile(file).BOS_TEST_VALEUR, "nouvelle");
  });

  it("génère un secret de session unique et stable", () => {
    ensureSessionSecret(app);
    const first = process.env.BOS_SESSION_SECRET;
    assert.ok(first && first.length >= 32);
    delete process.env.BOS_SESSION_SECRET;
    ensureSessionSecret(app);
    assert.equal(process.env.BOS_SESSION_SECRET, first);
  });

  it("code d'installation : vérifié, remplacé, puis détruit", () => {
    const code = ensureInstallationCode(app);
    assert.equal(ensureInstallationCode(app), code);
    assert.ok(checkInstallationCode(code, app));
    assert.ok(!checkInstallationCode("faux", app));
    const next = issueInstallationCode(app);
    assert.ok(!checkInstallationCode(code, app));
    consumeInstallationCode(app);
    assert.ok(!checkInstallationCode(next, app));
  });
});

describe("Signature du jeton GitHub", () => {
  it("vérifie la signature avec les clés publiées par GitHub", async () => {
    const { generateKeyPairSync, sign } = await import("node:crypto");
    const { verifyGithubToken } = await import("./github-oidc");
    const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const jwk = { ...publicKey.export({ format: "jwk" }), kid: "cle-test" };
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({ keys: [jwk] }))) as typeof fetch;
    try {
      const enc = (v: object) => Buffer.from(JSON.stringify(v)).toString("base64url");
      const unsigned = `${enc({ alg: "RS256", kid: "cle-test" })}.${enc(validClaims)}`;
      const token = `${unsigned}.${sign("RSA-SHA256", Buffer.from(unsigned), privateKey).toString("base64url")}`;
      assert.equal((await verifyGithubToken(token, NOW)).repository, validClaims.repository);
      const forged = `${enc({ alg: "RS256", kid: "cle-test" })}.${enc({ ...validClaims, repository: "pirate/x" })}`;
      await assert.rejects(verifyGithubToken(`${forged}.${token.split(".")[2]}`, NOW), /Signature invalide/);
      await assert.rejects(verifyGithubToken(`${enc({ alg: "none" })}.${enc(validClaims)}.x`, NOW), /Algorithme/);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
