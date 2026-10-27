import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import { after, afterEach, before, describe, it } from "node:test";
import { getAlertAddress, sendAlert, sendRunReport } from "./alerts";
import { backupFileName, buildBackup, gzipBackup } from "./backup";
import { getRepository } from "./data";
import { runHealthChecks } from "./health";
import { startSmtpSink } from "./testing/smtp-sink";

const KEYS = [
  "BOS_ALERTES_EMAIL",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_FROM",
  "BOS_EMAIL_REDIRECTION",
  "BOS_EMAIL_COPIE",
  "ANTHROPIC_API_KEY",
  "BOS_CRON_SECRET",
] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
function restore() {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
}

describe("Alertes", () => {
  let sink: Awaited<ReturnType<typeof startSmtpSink>>;
  before(async () => {
    sink = await startSmtpSink();
  });
  after(async () => sink.close());
  afterEach(restore);

  function configure() {
    process.env.BOS_ALERTES_EMAIL = "direction@jamaliance.com";
    process.env.SMTP_HOST = "127.0.0.1";
    process.env.SMTP_PORT = String(sink.port);
    process.env.SMTP_FROM = "BOS-IA <bos@jamaliance.com>";
    // Le mode test et la copie cachée ne concernent pas les messages internes.
    process.env.BOS_EMAIL_REDIRECTION = "test@jamaliance.com";
    process.env.BOS_EMAIL_COPIE = "archives@jamaliance.com";
  }

  it("ne fait rien sans adresse d'alerte ou sans SMTP", async () => {
    for (const k of KEYS) delete process.env[k];
    assert.deepEqual(await sendAlert("x", "y"), { sent: false, reason: "BOS_ALERTES_EMAIL non configuré" });
    process.env.BOS_ALERTES_EMAIL = "pas une adresse";
    assert.equal(getAlertAddress(), null);
    process.env.BOS_ALERTES_EMAIL = "direction@jamaliance.com";
    assert.deepEqual(await sendAlert("x", "y"), { sent: false, reason: "SMTP non configuré" });
  });

  it("envoie le rapport à l'équipe, sans redirection de test ni copie", async () => {
    configure();
    const before = sink.mails.length;
    const repo = await getRepository();
    const result = await sendRunReport(repo, [
      { agentId: "agt-001", statut: "succes", message: "1 action" },
      { agentId: "agt-002", statut: "echec", message: "Clé ANTHROPIC_API_KEY refusée" },
    ]);
    assert.deepEqual(result, { sent: true });
    const mail = sink.mails[before];
    assert.deepEqual(mail.to, ["<direction@jamaliance.com>"]);
    const body = mail.data.replace(/=\r?\n/g, "");
    assert.match(body, /Compliance Guardian/);
    assert.match(body, /proposition\(s\) attendent votre validation/);
    assert.match(body, /\/app\/agents/);
  });

  it("n'envoie pas de rapport quand tout va bien et que rien n'attend", async () => {
    configure();
    const repo = await getRepository();
    const pending = (await repo.getAgentActions()).filter((a) => a.hitlStatus === "pending");
    for (const a of pending) await repo.resolveHitl(a.id, "rejected");
    const result = await sendRunReport(repo, [{ agentId: "agt-001", statut: "succes", message: "ok" }]);
    assert.deepEqual(result, { sent: false, reason: "Rien à signaler" });
  });

  it("joint une sauvegarde compressée lisible", async () => {
    configure();
    const before = sink.mails.length;
    const backup = await buildBackup(await getRepository());
    assert.equal(backup.format, "bos-ia-sauvegarde");
    assert.equal(backup.totaux.apprenants, backup.donnees.apprenants.length);
    const gz = gzipBackup(backup);
    assert.equal(JSON.parse(gunzipSync(gz).toString("utf8")).totaux.sessions, backup.totaux.sessions);
    assert.match(backupFileName(new Date("2026-10-27T03:00:00Z")), /2026-10-27\.json$/);
    await sendAlert("Sauvegarde", "ci-joint", [
      { filename: "s.json.gz", content: gz, contentType: "application/gzip" },
    ]);
    assert.match(sink.mails[before].data, /filename=s\.json\.gz/);
  });
});

describe("Bilan de santé", () => {
  afterEach(restore);

  it("signale le mode démonstration comme une erreur et le reste comme à compléter", async () => {
    for (const k of KEYS) delete process.env[k];
    const health = await runHealthChecks();
    assert.equal(health.ok, false);
    const by = Object.fromEntries(health.checks.map((c) => [c.nom, c.statut]));
    assert.equal(by["Base de données"], "erreur");
    assert.equal(by["Agents IA"], "attention");
    assert.equal(by["E-mails (SMTP)"], "attention");
    assert.equal(by["Alertes"], "attention");
  });

  it("met en erreur un SMTP configuré mais injoignable", async () => {
    for (const k of KEYS) delete process.env[k];
    process.env.SMTP_HOST = "127.0.0.1";
    process.env.SMTP_PORT = "1";
    process.env.SMTP_FROM = "bos@jamaliance.com";
    const health = await runHealthChecks();
    assert.equal(health.checks.find((c) => c.nom === "E-mails (SMTP)")?.statut, "erreur");
  });
});
