/**
 * Sauvegardes quotidiennes de la base SQLite : copie réelle d'un fichier temporaire,
 * vérification, conservation, et restauration complète d'une copie.
 */
import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { backupDir, backupName, joursAConserver, listBackups, pruneBackups, runDailyBackup, verifyBackup } from "./sauvegardes";

async function reconnect() {
  const state = (globalThis as { __bosDb?: { pool: { end(): Promise<void> } } }).__bosDb;
  await state?.pool.end();
  (globalThis as { __bosDb?: unknown }).__bosDb = undefined;
}

describe("Conservation des copies", () => {
  const jours = (debut: string, n: number) =>
    Array.from({ length: n }, (_, i) => new Date(Date.parse(debut) + i * 86_400_000).toISOString().slice(0, 10));

  it("garde les 30 dernières et la première de chacun des 12 derniers mois", () => {
    const tous = jours("2025-06-01", 534); // jusqu'au 2026-11-16
    const now = new Date("2026-11-16T12:00:00Z");
    const garder = joursAConserver(tous, now);
    const recentes = tous.slice(-30);
    for (const j of recentes) assert.ok(garder.has(j), j);
    for (const m of ["2025-12", "2026-01", "2026-06", "2026-10", "2026-11"]) assert.ok(garder.has(`${m}-01`), m);
    assert.ok(!garder.has("2025-11-01"), "plus de 12 mois : retirée");
    assert.ok(!garder.has("2026-03-15"), "milieu de mois ancien : retirée");
    assert.equal(garder.size, 30 + 11); // le 1er novembre est déjà parmi les 30 dernières
  });

  it("ne retire rien tant qu'il y a moins de 30 copies", () => {
    const tous = jours("2026-11-01", 10);
    assert.equal(joursAConserver(tous, new Date("2026-11-11")).size, 10);
  });

  it("ne touche qu'aux fichiers bos-ia-AAAA-MM-JJ.sqlite", () => {
    const dir = mkdtempSync(join(tmpdir(), "bos-prune-"));
    try {
      for (const j of jours("2026-01-10", 60)) writeFileSync(join(dir, `bos-ia-${j}.sqlite`), "x");
      writeFileSync(join(dir, "bos-ia.sqlite"), "base");
      writeFileSync(join(dir, "notes.txt"), "à garder");
      const retirees = pruneBackups(dir, new Date("2026-03-11T00:00:00Z"));
      assert.equal(retirees.length, 60 - 30 - 2); // 30 dernières + 1er février + premier de janvier (le 10)
      assert.ok(existsSync(join(dir, "bos-ia.sqlite")));
      assert.ok(existsSync(join(dir, "notes.txt")));
      assert.ok(existsSync(join(dir, "bos-ia-2026-01-10.sqlite")));
      assert.ok(existsSync(join(dir, "bos-ia-2026-02-01.sqlite")));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("Copie quotidienne de la base SQLite", () => {
  const dir = mkdtempSync(join(tmpdir(), "bos-sauvegarde-"));
  const base = join(dir, "bos-data", "bos-ia.sqlite");
  let repo: typeof import("./mysql").mysqlRepository;

  before(async () => {
    process.env.BOS_DB_ENGINE = "sqlite";
    process.env.BOS_SQLITE_PATH = base;
    delete process.env.BOS_SAUVEGARDES_DIR;
    repo = (await import("./mysql")).mysqlRepository;
    await repo.createClient({ nom: "Atelier Nord", statut: "actif" });
    await repo.createClient({ nom: "Océan Services", statut: "prospect" });
  });

  after(async () => {
    await reconnect();
    rmSync(dir, { recursive: true, force: true });
  });

  it("range les copies à côté de la base, hors du dossier de l'application", () => {
    assert.equal(backupDir(), join(dir, "bos-data", "sauvegardes"));
    assert.equal(backupDir({ ...process.env, BOS_SAUVEGARDES_DIR: "/ailleurs" }), "/ailleurs");
  });

  it("crée la copie du jour, la vérifie, sans modifier la base", async () => {
    const avant = statSync(base).size;
    const now = new Date("2026-11-16T05:43:00Z");
    const r = await runDailyBackup({ now });
    assert.equal(r.statut, "creee");
    assert.equal(r.fichier, join(dir, "bos-data", "sauvegardes", backupName(now)));
    assert.equal(r.verification?.ok, true);
    assert.equal(r.verification?.integrite, "ok");
    assert.equal(r.verification?.totaux.clients, 2);
    assert.equal(r.verification?.totaux.agents, 6);
    assert.equal(statSync(base).size, avant);
    assert.equal((await repo.getClients()).length, 2);
    assert.ok(!readdirSync(join(dir, "bos-data", "sauvegardes")).some((f) => f.endsWith(".en-cours")));
    if (process.platform !== "win32") assert.equal(statSync(r.fichier!).mode & 0o777, 0o600);
  });

  it("une seule copie par jour ; forcer la refait avec les dernières données", async () => {
    const now = new Date("2026-11-16T18:00:00Z");
    assert.equal((await runDailyBackup({ now })).statut, "deja_faite");
    await repo.createClient({ nom: "Troisième", statut: "actif" });
    const r = await runDailyBackup({ now, force: true });
    assert.equal(r.statut, "creee");
    assert.equal(r.verification?.totaux.clients, 3);
    assert.equal(listBackups().length, 1);
  });

  it("une copie ratée ne laisse aucun fichier et ne remplace pas la précédente", async () => {
    const now = new Date("2026-11-16T20:00:00Z");
    await assert.rejects(
      runDailyBackup({ now, force: true, snapshot: async (t) => writeFileSync(t, "pas une base") }),
    );
    const copies = listBackups();
    assert.equal(copies.length, 1);
    assert.equal(verifyBackup(copies[0].fichier).totaux.clients, 3);
    assert.ok(!readdirSync(backupDir()).some((f) => f.endsWith(".en-cours")));
  });

  it("restauration : une copie remise à la place de la base redonne toutes les données", async () => {
    const copie = listBackups()[0].fichier;
    const restauree = join(dir, "restauration", "bos-ia.sqlite");
    await reconnect();
    process.env.BOS_SQLITE_PATH = restauree;
    try {
      const { mkdirSync } = await import("node:fs");
      mkdirSync(join(dir, "restauration"));
      copyFileSync(copie, restauree);
      const noms = (await repo.getClients()).map((c) => c.nom).sort();
      assert.deepEqual(noms, ["Atelier Nord", "Océan Services", "Troisième"]);
      assert.equal((await repo.getAgents()).length, 6);
    } finally {
      await reconnect();
      process.env.BOS_SQLITE_PATH = base;
    }
  });

  it("sans base SQLite : rien à copier", async () => {
    process.env.BOS_DB_ENGINE = "";
    try {
      const saved = { ...process.env };
      for (const k of ["DB_HOST", "DB_NAME", "DB_USER", "DATABASE_URL"]) delete process.env[k];
      assert.equal((await runDailyBackup()).statut, "ignoree");
      Object.assign(process.env, saved);
    } finally {
      process.env.BOS_DB_ENGINE = "sqlite";
    }
  });
});
