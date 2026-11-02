import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DatabaseConfig } from "./config";
import { checkDatabase, testDatabaseConnection } from "./connection-test";

const ok = async () => ({ ok: true as const });
const refuse = async () => ({ ok: false as const, erreur: "ER_ACCESS_DENIED_ERROR : Access denied" });

describe("Base de données testée avant enregistrement", () => {
  it("enregistre les réglages qui se connectent, avec localhost par défaut", async () => {
    const values: Record<string, string> = { DB_NAME: "u1_bosia", DB_USER: "u1_bos", DB_PASSWORD: "x", BOS_CRON_SECRET: "c" };
    const report = await checkDatabase(values, ok, {});
    assert.deepEqual(report, { statut: "connectee", hote: "localhost" });
    assert.equal(values.DB_HOST, "localhost");
    assert.equal(values.DB_NAME, "u1_bosia");
  });

  it("essaie 127.0.0.1 si localhost échoue", async () => {
    const tried: string[] = [];
    const values: Record<string, string> = { DB_NAME: "b", DB_USER: "u", DB_PASSWORD: "p" };
    const report = await checkDatabase(values, async (c: DatabaseConfig) => {
      tried.push(c.host);
      return c.host === "127.0.0.1" ? { ok: true } : { ok: false, erreur: "ECONNREFUSED" };
    }, {});
    assert.deepEqual(tried, ["localhost", "127.0.0.1"]);
    assert.deepEqual(report, { statut: "connectee", hote: "127.0.0.1" });
    assert.equal(values.DB_HOST, "127.0.0.1");
  });

  it("écarte des réglages refusés : le cockpit garde sa configuration", async () => {
    const values = { DB_NAME: "b", DB_USER: "u", DB_PASSWORD: "faux", ANTHROPIC_API_KEY: "k" };
    const report = await checkDatabase(values, refuse, {});
    assert.equal(report.statut, "refusee");
    assert.deepEqual(values, { ANTHROPIC_API_KEY: "k" });
  });

  it("signale des réglages incomplets sans rien tester", async () => {
    let calls = 0;
    const values = { DB_PASSWORD: "p" };
    const report = await checkDatabase(values, async () => (calls++, { ok: true }), {});
    assert.equal(report.statut, "refusee");
    assert.equal(calls, 0);
    assert.deepEqual(values, {});
  });

  it("sans réglage transmis, teste la base en place", async () => {
    assert.deepEqual(await checkDatabase({}, ok, {}), { statut: "non_configuree" });
    const env = { DB_HOST: "localhost", DB_NAME: "b", DB_USER: "u" };
    assert.deepEqual(await checkDatabase({}, ok, env), { statut: "connectee", hote: "localhost" });
    assert.equal((await checkDatabase({}, refuse, env)).statut, "injoignable");
  });

  it("rapporte une vraie connexion impossible sans planter", async () => {
    const result = await testDatabaseConnection({ host: "127.0.0.1", port: 1, user: "u", password: "", database: "b" }, 2000);
    assert.equal(result.ok, false);
  });
});
