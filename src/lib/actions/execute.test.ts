import assert from "node:assert/strict";
import { after, afterEach, before, describe, it } from "node:test";
import { getRepository } from "../data";
import { getMailConfig, prepareMail, sendMail } from "../mail";
import { store } from "../store";
import { startSmtpSink } from "../testing/smtp-sink";
import { ActionError, decideAction, retryAction, withRecipients } from "./execute";

const MAIL_KEYS = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_SECURE",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "SMTP_FROM",
  "BOS_EMAIL_REDIRECTION",
  "BOS_EMAIL_COPIE",
];
const saved = Object.fromEntries(MAIL_KEYS.map((k) => [k, process.env[k]]));
function restoreEnv() {
  for (const k of MAIL_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
}

describe("Configuration SMTP", () => {
  afterEach(restoreEnv);

  it("reste désactivé sans hôte ni expéditeur", () => {
    for (const k of MAIL_KEYS) delete process.env[k];
    assert.equal(getMailConfig(), null);
    process.env.SMTP_HOST = "smtp.gmail.com";
    assert.equal(getMailConfig(), null);
  });

  it("déduit le chiffrement du port et ignore une redirection invalide", () => {
    for (const k of MAIL_KEYS) delete process.env[k];
    process.env.SMTP_HOST = "smtp.gmail.com";
    process.env.SMTP_FROM = "Jamaliance <contact@jamaliance.com>";
    assert.equal(getMailConfig()?.port, 587);
    assert.equal(getMailConfig()?.secure, false);
    process.env.SMTP_PORT = "465";
    assert.equal(getMailConfig()?.secure, true);
    process.env.BOS_EMAIL_REDIRECTION = "pas-une-adresse";
    assert.equal(getMailConfig()?.redirection, null);
  });

  it("redirige vers l'adresse de test en le signalant", () => {
    const base = { host: "h", port: 587, secure: false, user: null, password: null, from: "f@j.fr", copie: null };
    const mail = { to: "client@exemple.fr", subject: "Relance", text: "Bonjour" };
    assert.deepEqual(prepareMail({ ...base, redirection: null }, mail), mail);
    const test = prepareMail({ ...base, redirection: "moi@jamaliance.com" }, mail);
    assert.equal(test.to, "moi@jamaliance.com");
    assert.equal(test.subject, "[TEST → client@exemple.fr] Relance");
    assert.match(test.text, /destiné à client@exemple\.fr/);
  });
});

describe("Envoi SMTP réel (serveur de test local)", () => {
  let sink: Awaited<ReturnType<typeof startSmtpSink>>;
  before(async () => {
    sink = await startSmtpSink();
  });
  after(async () => sink.close());

  it("envoie l'e-mail en UTF-8 avec copie cachée", async () => {
    const config = {
      host: "127.0.0.1",
      port: sink.port,
      secure: false,
      user: null,
      password: null,
      from: "Jamaliance <contact@jamaliance.com>",
      redirection: null,
      copie: "archives@jamaliance.com",
    };
    const sent = await sendMail(config, { to: "camille@exemple.fr", subject: "Échéance dépassée", text: "Bonjour Camille," });
    assert.equal(sent.to, "camille@exemple.fr");
    assert.equal(sink.mails.length, 1);
    assert.deepEqual(sink.mails[0].to, ["<camille@exemple.fr>", "<archives@jamaliance.com>"]);
    assert.match(sink.mails[0].data, /Subject: =\?UTF-8\?/);
  });
});

describe("Décision et exécution (mode démonstration)", () => {
  afterEach(restoreEnv);

  it("simule l'envoi en démo, une seule fois, avec le brouillon modifié", async () => {
    const repo = await getRepository();
    assert.equal(repo.mode, "demo");
    const client = store.getClients().find((c) => c.email && c.contact)!;
    const run = store.recordAgentRun(
      "agt-001",
      {
        resume: "Suivi proposé.",
        actions: [
          {
            type: "suivi_client",
            description: "Prendre des nouvelles",
            requiresHitl: true,
            email: { cible: "client", refId: client.id, objet: "Suivi", corps: "Bonjour" },
          },
        ],
      },
      "modele-test",
    )!;
    const id = run.actions[0].id;

    const [enriched] = await withRecipients(repo, [run.actions[0]]);
    assert.deepEqual(enriched.email?.destinataire, {
      nom: `${client.contact} (${client.nom})`,
      email: client.email,
    });

    const decided = await decideAction(repo, id, "approved", { objet: "  Suivi de votre projet  ", corps: "" });
    assert.equal(decided.execution?.statut, "simule");
    assert.equal(decided.email?.objet, "Suivi de votre projet");
    assert.equal(decided.email?.corps, "Bonjour", "un champ vide ne remplace pas le texte");

    await assert.rejects(() => decideAction(repo, id, "approved"), ActionError, "double clic refusé");
    await assert.rejects(() => retryAction(repo, id), ActionError, "rien à renvoyer après simulation");
  });

  it("refuse sans rien exécuter", async () => {
    const repo = await getRepository();
    const run = store.recordAgentRun(
      "agt-006",
      {
        resume: "r",
        actions: [
          {
            type: "t",
            description: "d",
            requiresHitl: true,
            email: { cible: "client", refId: store.getClients()[0].id, objet: "o", corps: "c" },
          },
        ],
      },
      "m",
    )!;
    const decided = await decideAction(repo, run.actions[0].id, "rejected");
    assert.equal(decided.hitlStatus, "rejected");
    assert.equal(decided.execution, undefined);
  });
});

describe("Changements de statut approuvés (mode démonstration)", () => {
  it("applique le statut choisi par l'humain, une seule fois", async () => {
    const repo = await getRepository();
    const client = store.getClients().find((c) => c.statut === "prospect")!;
    const run = store.recordAgentRun(
      "agt-001",
      {
        resume: "r",
        actions: [
          {
            type: "prospect_inactif",
            description: "Prospect sans réponse",
            requiresHitl: true,
            operation: { type: "statut_client", refId: client.id, valeur: "inactif" },
          },
        ],
      },
      "m",
    )!;
    const [shown] = await withRecipients(repo, [run.actions[0]]);
    assert.equal(shown.operation?.cible?.libelle, client.nom);
    assert.equal(shown.operation?.cible?.actuel, "Prospect");

    const decided = await decideAction(repo, run.actions[0].id, "approved", { valeur: "perdu" }, "Léa");
    assert.equal(decided.execution?.statut, "fait");
    assert.match(decided.execution!.message, /Prospect → Perdu/);
    assert.equal(store.getClients().find((c) => c.id === client.id)?.statut, "perdu");
    assert.equal(decided.decidePar, "Léa");
    await assert.rejects(() => retryAction(repo, run.actions[0].id), ActionError, "déjà appliqué");
  });

  it("ignore une valeur non autorisée choisie à l'approbation", async () => {
    const repo = await getRepository();
    const invoice = store.getInvoices().find((i) => i.status === "emise")!;
    const run = store.recordAgentRun(
      "agt-003",
      {
        resume: "r",
        actions: [
          {
            type: "relance",
            description: "Facture en relance",
            requiresHitl: true,
            operation: { type: "statut_facture", refId: invoice.id, valeur: "relance" },
          },
        ],
      },
      "m",
    )!;
    const decided = await decideAction(repo, run.actions[0].id, "approved", { valeur: "payee" });
    assert.equal(decided.operation?.valeur, "relance");
    assert.equal(store.getInvoices().find((i) => i.id === invoice.id)?.status, "relance");
  });

  it("refuse de changer le statut d'une facture déjà payée", async () => {
    const repo = await getRepository();
    const paid = store.getInvoices().find((i) => i.status === "payee")!;
    const run = store.recordAgentRun(
      "agt-003",
      {
        resume: "r",
        actions: [
          {
            type: "relance",
            description: "Relance",
            requiresHitl: true,
            operation: { type: "statut_facture", refId: paid.id, valeur: "relance" },
          },
        ],
      },
      "m",
    )!;
    const decided = await decideAction(repo, run.actions[0].id, "approved");
    assert.equal(decided.execution?.statut, "echec");
    assert.match(decided.execution!.message, /déjà payée/);
    assert.equal(store.getInvoices().find((i) => i.id === paid.id)?.status, "payee");
  });

  it("combine statut et e-mail, et n'envoie rien si la fiche a disparu", async () => {
    const repo = await getRepository();
    const mission = store.getMissions().find((m) => m.statut === "en_cours")!;
    const both = store.recordAgentRun(
      "agt-002",
      {
        resume: "r",
        actions: [
          {
            type: "livraison",
            description: "Annoncer la livraison et passer la mission en livrée",
            requiresHitl: true,
            email: { cible: "client", refId: mission.clientId, objet: "Livraison", corps: "Bonjour" },
            operation: { type: "statut_mission", refId: mission.id, valeur: "livree" },
          },
          {
            type: "fantome",
            description: "Fiche inexistante",
            requiresHitl: true,
            email: { cible: "client", refId: mission.clientId, objet: "x", corps: "y" },
            operation: { type: "statut_mission", refId: "mis-inexistante", valeur: "livree" },
          },
        ],
      },
      "m",
    )!;
    const ok = await decideAction(repo, both.actions[0].id, "approved");
    assert.equal(ok.execution?.statut, "simule");
    assert.match(ok.execution!.message, /En cours → Livrée ; Mode démonstration/);
    const ko = await decideAction(repo, both.actions[1].id, "approved");
    assert.equal(ko.execution?.statut, "echec");
    assert.match(ko.execution!.message, /Fiche introuvable/);
  });
});

describe("Règles HITL partagées", () => {
  it("nettoie le brouillon modifié (objet sur une ligne, bornes)", async () => {
    const { cleanEdits } = await import("./rules");
    assert.deepEqual(cleanEdits({ objet: " Relance\r\nBcc: x@y.z ", corps: "  " }), { objet: "Relance Bcc: x@y.z" });
    assert.equal(cleanEdits({ corps: "a".repeat(6000) }).corps?.length, 5000);
  });

  it("autorise le renvoi après échec, attente ou envoi bloqué depuis 10 min", async () => {
    const { isRetryable } = await import("./rules");
    const now = Date.parse("2026-10-27T10:00:00Z");
    const at = (min: number) => new Date(now - min * 60_000).toISOString();
    assert.equal(isRetryable({ statut: "echec", le: at(0), message: "" }, now), true);
    assert.equal(isRetryable({ statut: "a_faire", le: at(0), message: "" }, now), true);
    assert.equal(isRetryable({ statut: "envoye", le: at(60), message: "" }, now), false);
    assert.equal(isRetryable({ statut: "simule", le: at(60), message: "" }, now), false);
    assert.equal(isRetryable({ statut: "en_cours", le: at(2), message: "" }, now), false);
    assert.equal(isRetryable({ statut: "en_cours", le: at(11), message: "" }, now), true);
  });
});
