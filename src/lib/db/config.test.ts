import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { getDatabaseConfig } from "./config";
import { daysLate, fromSqlDateTime, parseJsonArray, toSqlDateTime } from "./mysql";

const KEYS = ["DATABASE_URL", "DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD"];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function clear() {
  for (const k of KEYS) delete process.env[k];
}

describe("Configuration de la base", () => {
  it("reste en démonstration sans variable", () => {
    clear();
    assert.equal(getDatabaseConfig(), null);
  });

  it("lit les variables DB_* de hPanel", () => {
    clear();
    process.env.DB_HOST = "localhost";
    process.env.DB_NAME = "u123_bosia";
    process.env.DB_USER = "u123_bos";
    process.env.DB_PASSWORD = "secret";
    assert.deepEqual(getDatabaseConfig(), {
      host: "localhost",
      port: 3306,
      user: "u123_bos",
      password: "secret",
      database: "u123_bosia",
    });
  });

  it("exige hôte, base et utilisateur", () => {
    clear();
    process.env.DB_HOST = "localhost";
    process.env.DB_USER = "u123_bos";
    assert.equal(getDatabaseConfig(), null);
  });

  it("préfère DATABASE_URL et décode le mot de passe", () => {
    clear();
    process.env.DB_HOST = "ignore";
    process.env.DATABASE_URL = "mysql://bos:p%40ss%2Fw@db.example:3307/bosia";
    assert.deepEqual(getDatabaseConfig(), {
      host: "db.example",
      port: 3307,
      user: "bos",
      password: "p@ss/w",
      database: "bosia",
    });
  });

  it("refuse une URL invalide ou d'un autre moteur", () => {
    clear();
    process.env.DATABASE_URL = "postgres://bos:x@h/db";
    assert.equal(getDatabaseConfig(), null);
    process.env.DATABASE_URL = "pas une url";
    assert.equal(getDatabaseConfig(), null);
  });
});

describe("Conversions MySQL", () => {
  it("fait l'aller-retour ISO ↔ DATETIME en UTC", () => {
    const iso = "2026-10-27T08:15:30.123Z";
    assert.equal(toSqlDateTime(iso), "2026-10-27 08:15:30.123");
    assert.equal(fromSqlDateTime("2026-10-27 08:15:30.123"), iso);
  });

  it("lit le JSON en objet (MySQL) comme en chaîne (MariaDB)", () => {
    assert.deepEqual(parseJsonArray(["I4", "I11"]), ["I4", "I11"]);
    assert.deepEqual(parseJsonArray('["I4","I11"]'), ["I4", "I11"]);
    assert.deepEqual(parseJsonArray(null), []);
  });

  it("calcule les jours de retard à partir de l'échéance", () => {
    assert.equal(daysLate("2026-10-17", "emise", "2026-10-27"), 10);
    assert.equal(daysLate("2026-11-01", "emise", "2026-10-27"), 0);
    assert.equal(daysLate("2026-10-17", "payee", "2026-10-27"), 0);
  });
});
