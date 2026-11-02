/**
 * Test d'intégration sur une vraie base MySQL / MariaDB.
 * Ignoré sans BOS_TEST_DATABASE_URL (ex. mysql://bos:mdp@127.0.0.1:3306/bosia_test).
 * ATTENTION : supprime les tables bos_* de cette base.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import mysql from "mysql2/promise";

const url = process.env.BOS_TEST_DATABASE_URL;

/** Ferme le pool : le prochain accès revérifie le schéma (et ajoute les colonnes manquantes). */
async function reconnect() {
  const state = (globalThis as { __bosDb?: { pool: { end(): Promise<void> } } }).__bosDb;
  await state?.pool.end();
  (globalThis as { __bosDb?: unknown }).__bosDb = undefined;
}

const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);

describe("Moteur MySQL", { skip: !url && "BOS_TEST_DATABASE_URL non défini" }, () => {
  let repo: typeof import("./mysql").mysqlRepository;
  let conn: mysql.Connection;

  before(async () => {
    process.env.DATABASE_URL = url;
    conn = await mysql.createConnection(url!);
    for (const t of [
      "bos_agent_actions",
      "bos_agent_runs",
      "bos_agents",
      "bos_audit",
      "bos_users",
      "bos_paiements",
      "bos_devis",
      "bos_contacts",
      "bos_factures",
      "bos_missions",
      "bos_clients",
    ]) {
      await conn.query(`DROP TABLE IF EXISTS ${t}`);
    }
    repo = (await import("./mysql")).mysqlRepository;
  });

  after(async () => {
    await conn.end();
    const state = (globalThis as { __bosDb?: { pool: { end(): Promise<void> } } }).__bosDb;
    await state?.pool.end();
  });

  it("crée le schéma et les 6 agents, sans données métier fictives", async () => {
    const agents = await repo.getAgents();
    assert.equal(agents.length, 6);
    assert.ok(agents.every((a) => a.status === "actif"));
    assert.deepEqual(
      agents.map((a) => a.nom),
      ["Suivi commercial", "Suivi des missions", "Recouvrement assisté", "Pilotage financier", "Conformité RGPD", "Assistant e-mails"],
    );
    assert.equal((await repo.getClients()).length, 0);
    assert.equal((await repo.getMissions()).length, 0);
    assert.equal((await repo.getInvoices()).length, 0);
    assert.equal((await repo.getPayments()).length, 0);
    const metrics = await repo.getMetrics();
    assert.equal(metrics.mrr, null);
    assert.equal(metrics.delaiPaiementMoyen, null);
    assert.equal(metrics.aEncaisser, 0);
    assert.equal(metrics.agentsActifs, 6);
  });

  it("enregistre une analyse d'agent et la file HITL de façon persistante", async () => {
    const run = await repo.recordAgentRun(
      "agt-003",
      {
        resume: "Une facture est en retard.",
        actions: [
          { type: "relance_facture", description: "Relancer le client", requiresHitl: true },
          { type: "note", description: "Rien d'autre", requiresHitl: false },
        ],
      },
      "modele-test",
    );
    assert.equal(run?.actions.length, 2);

    const pending = (await repo.getAgentActions()).find((a) => a.hitlStatus === "pending");
    assert.ok(pending);
    assert.equal((await repo.getAgents()).find((a) => a.id === "agt-003")?.status, "en_attente_hitl");

    const resolved = await repo.resolveHitl(pending!.id, "approved");
    assert.equal(resolved?.hitlStatus, "approved");
    const agent = (await repo.getAgents()).find((a) => a.id === "agt-003");
    assert.equal(agent?.status, "actif");
    assert.match(agent!.derniereAction, /HITL approuvé/);
    assert.equal(await repo.resolveHitl("act-inexistante", "approved"), null);
  });

  it("saisit clients et missions (doublons refusés, champs effacés, numérotation)", async () => {
    const a = await repo.createClient({ nom: "Atelier Nord", statut: "prospect", contact: "Camille", email: "camille@atelier.example", source: "Site" });
    assert.ok(a.ok);
    if (!a.ok) return;
    assert.equal(a.value.email, "camille@atelier.example");
    const dup = await repo.createClient({ nom: "Atelier Nord", statut: "actif" });
    assert.deepEqual(dup.ok ? null : dup.status, 409);

    const b = await repo.createClient({ nom: "Océan Services", statut: "actif" });
    assert.ok(b.ok);
    const renamed = await repo.updateClient(a.value.id, { statut: "actif", source: "" });
    assert.ok(renamed.ok);
    if (renamed.ok) {
      assert.equal(renamed.value.statut, "actif");
      assert.equal(renamed.value.source, undefined, "champ facultatif effacé");
      assert.equal(renamed.value.contact, "Camille", "champ absent du patch conservé");
    }
    assert.equal((await repo.updateClient(a.value.id, { nom: "Océan Services" })).ok, false, "nom déjà pris");
    assert.equal((await repo.updateClient("inconnu", { statut: "actif" })).ok, false);

    const m1 = await repo.createMission({ titre: "Agent IA devis", clientId: a.value.id, type: "agent_ia", statut: "signee", montantHT: 4800, debut: "2026-11-03" });
    const m2 = await repo.createMission({ titre: "Maintenance", clientId: a.value.id, type: "abonnement", statut: "en_cours", montantHT: 150 });
    assert.ok(m1.ok && m2.ok);
    if (!m1.ok || !m2.ok) return;
    const year = new Date().getUTCFullYear();
    assert.equal(m1.value.code, `MIS-${year}-0001`);
    assert.equal(m2.value.code, `MIS-${year}-0002`);
    assert.equal(m1.value.debut, "2026-11-03");
    const moved = await repo.updateMission(m1.value.id, { statut: "en_cours", fin: "2026-12-15", montantHT: 5000 });
    assert.ok(moved.ok);
    if (moved.ok) {
      assert.equal(moved.value.montantHT, 5000);
      assert.equal(moved.value.fin, "2026-12-15");
    }
    assert.equal((await repo.updateMission(m1.value.id, { fin: "2026-01-01" })).ok, false, "fin avant le début");
    assert.equal((await repo.createMission({ titre: "x", clientId: "inconnu", type: "autre", statut: "proposition", montantHT: 0 })).ok, false);

    const metrics = await repo.getMetrics();
    assert.equal(metrics.clientsActifs, 2);
    assert.equal(metrics.missionsEnCours, 2);
    assert.equal(metrics.carnetCommandes, 5150);
  });

  it("facture puis encaisse : acompte, solde, verrou contre le double paiement", async () => {
    const [client] = (await repo.getClients()).filter((c) => c.nom === "Atelier Nord");
    const [other] = (await repo.getClients()).filter((c) => c.nom === "Océan Services");
    const mission = (await repo.getMissions()).find((m) => m.clientId === client.id)!;
    assert.equal(
      (await repo.createInvoice({ clientId: other.id, missionId: mission.id, montantHT: 10, tauxTva: 20, status: "emise", emiseLe: iso(0), echeance: iso(0) })).ok,
      false,
      "mission d'un autre client refusée",
    );

    const created = await repo.createInvoice({
      clientId: client.id,
      missionId: mission.id,
      objet: "Acompte",
      montantHT: 1000,
      tauxTva: 20,
      status: "emise",
      emiseLe: iso(30),
      echeance: iso(10),
    });
    assert.ok(created.ok);
    if (!created.ok) return;
    const inv = created.value;
    assert.equal(inv.numero, `FA-${iso(30).slice(0, 4)}-0001`);
    assert.equal(inv.montantTTC, 1200);
    assert.equal(inv.client, "Atelier Nord");
    assert.equal(inv.emailClient, "camille@atelier.example", "adresse lue sur la fiche client");
    assert.equal(inv.joursRetard, 10);
    assert.equal((await repo.createInvoice({ numero: inv.numero, clientId: client.id, montantHT: 1, tauxTva: 0, status: "emise", emiseLe: iso(0), echeance: iso(0) })).ok, false);

    const first = await repo.recordPayment({ factureId: inv.id, montant: 400, date: iso(20), mode: "virement", reference: "VIR 1" });
    assert.ok(first.ok);
    if (first.ok) {
      assert.equal(first.value.invoice.status, "partiellement_payee");
      assert.equal(first.value.invoice.resteDu, 800);
      assert.match(first.value.payment.numero, /^REG-\d{4}-0001$/);
    }

    // Deux saisies simultanées du solde : une seule passe (facture verrouillée).
    const both = await Promise.all([
      repo.recordPayment({ factureId: inv.id, montant: 800, date: iso(5), mode: "carte" }),
      repo.recordPayment({ factureId: inv.id, montant: 800, date: iso(5), mode: "carte" }),
    ]);
    assert.equal(both.filter((r) => r.ok).length, 1);
    const paid = (await repo.getInvoices()).find((i) => i.id === inv.id)!;
    assert.equal(paid.status, "payee");
    assert.equal(paid.payeeLe, iso(5));
    assert.equal(paid.montantPaye, 1200);
    assert.equal(paid.resteDu, 0);
    assert.equal(paid.joursRetard, 0);
    assert.equal((await repo.getPayments()).length, 2);
    assert.equal((await repo.updateInvoiceStatus(inv.id, "relance")).ok, false, "facture payée verrouillée");

    const draft = await repo.createInvoice({ clientId: other.id, montantHT: 50, tauxTva: 0, status: "brouillon", emiseLe: iso(0), echeance: iso(-30) });
    assert.ok(draft.ok);
    if (!draft.ok) return;
    assert.equal((await repo.recordPayment({ factureId: draft.value.id, montant: 50, date: iso(0), mode: "virement" })).ok, false);
    const issued = await repo.updateInvoiceStatus(draft.value.id, "emise");
    assert.ok(issued.ok);
    assert.equal((await repo.updateInvoiceStatus(draft.value.id, "payee")).ok, false, "payée seulement par un paiement");

    const metrics = await repo.getMetrics();
    assert.equal(metrics.aEncaisser, 50);
    assert.equal(metrics.delaiPaiementMoyen, 25);
    assert.equal(metrics.delaiPaiementBase, 1);
  });

  it("importe clients, missions, factures et paiements (vérifier puis importer)", async () => {
    const { importIntoDatabase } = await import("./import");
    const { parseImport } = await import("@/lib/import/schema");
    const parse = (kind: Parameters<typeof parseImport>[0], table: string[][]) => {
      const parsed = parseImport(kind, table);
      assert.deepEqual(parsed.errors, [], kind);
      return parsed.rows;
    };

    const clients = parse("clients", [
      ["Société", "Contact", "E-mail", "Statut"],
      ["TechBridge", "Li Chen", "Li@TechBridge.example", "Prospect"],
      ["Atelier Nord", "", "", "Actif"],
    ]);
    const check = await importIntoDatabase("clients", clients, { dryRun: true });
    assert.deepEqual([check.created, check.updated, check.committed], [1, 1, false]);
    assert.equal((await repo.getClients()).length, 2, "la vérification n'écrit rien");
    const done = await importIntoDatabase("clients", clients, { dryRun: false });
    assert.equal(done.committed, true);
    const atelier = (await repo.getClients()).find((c) => c.nom === "Atelier Nord")!;
    assert.equal(atelier.contact, "Camille", "cellule vide : valeur conservée");
    assert.equal((await repo.getClients()).find((c) => c.nom === "TechBridge")?.email, "li@techbridge.example");

    const missions = parse("missions", [
      ["code", "titre", "client", "type", "statut", "montant_ht"],
      ["IMP-M1", "Agent de qualification", "TechBridge", "Agent IA", "Proposition", "5 400"],
      ["IMP-M2", "Inconnue", "Client fantôme", "", "", ""],
    ]);
    const refused = await importIntoDatabase("missions", missions, { dryRun: false });
    assert.equal(refused.committed, false, "tout ou rien");
    assert.match(refused.errors[0].message, /Client fantôme.*introuvable/);
    assert.equal((await importIntoDatabase("missions", missions.slice(0, 1), { dryRun: false })).committed, true);

    const factures = parse("factures", [
      ["numero", "client", "mission_code", "montant_ht", "taux_tva", "emise_le", "echeance", "recurrence"],
      ["IMP-F1", "TechBridge", "IMP-M1", "1000", "20", iso(40), iso(10), ""],
      ["IMP-ABO", "TechBridge", "", "120", "20", iso(5), iso(-25), "Mensuel"],
      ["IMP-MAUVAISE", "Atelier Nord", "IMP-M1", "10", "", iso(5), iso(1), ""],
    ]);
    const wrong = await importIntoDatabase("factures", factures, { dryRun: true });
    assert.match(wrong.errors[0].message, /n'est pas celle de ce client/);
    assert.equal((await importIntoDatabase("factures", factures.slice(0, 2), { dryRun: false })).created, 2);

    const paiements = parse("paiements", [
      ["numero", "facture_numero", "montant", "date", "mode"],
      ["IMP-R1", "IMP-F1", "600", iso(30), "Virement"],
      ["IMP-R2", "IMP-F1", "600", iso(20), "Stripe"],
    ]);
    assert.equal((await importIntoDatabase("paiements", paiements, { dryRun: false })).created, 2);
    const f1 = (await repo.getInvoices()).find((i) => i.numero === "IMP-F1")!;
    assert.equal(f1.status, "payee", "soldée par les paiements importés");
    assert.equal(f1.payeeLe, iso(20));
    const trop = parse("paiements", [["numero", "facture_numero", "montant", "date"], ["IMP-R3", "IMP-F1", "1", iso(1)]]);
    const over = await importIntoDatabase("paiements", trop, { dryRun: false });
    assert.match(over.errors[0].message, /supérieurs au montant TTC/);

    const metrics = await repo.getMetrics();
    assert.equal(metrics.mrr, 120);
    assert.equal(metrics.abonnementsActifs, 1);
    assert.equal(metrics.delaiPaiementBase, 2);
  });

  it("journalise les exécutions et pose un verrou exclusif", async () => {
    const debut = "2026-10-27T06:17:00.000Z";
    await repo.logAgentRun({
      id: "run-1", agentId: "agt-001", declencheur: "planifie", debut, fin: debut,
      statut: "succes", message: "RAS", actions: 2, model: "modele-test",
    });
    await repo.logAgentRun({
      id: "run-2", agentId: "agt-002", declencheur: "manuel", debut: "2026-10-27T07:00:00.000Z",
      fin: "2026-10-27T07:00:01.000Z", statut: "echec", message: "Clé refusée", actions: 0,
    });
    const runs = await repo.getAgentRuns(10);
    assert.deepEqual(runs.map((r) => r.id), ["run-2", "run-1"]);
    assert.equal(runs[1].debut, debut);
    assert.equal(runs[1].model, "modele-test");
    assert.equal(runs[0].model, undefined);

    let inner: unknown = "non appelé";
    const outer = await repo.withLock("test", async () => {
      inner = await repo.withLock("test", async () => "doublon");
      return "ok";
    });
    assert.deepEqual(outer, { value: "ok" });
    assert.equal(inner, null, "un second détenteur est refusé pendant le travail");
    assert.deepEqual(await repo.withLock("test", async () => 1), { value: 1 }, "verrou libéré ensuite");
  });

  it("migre une base existante puis exécute les e-mails approuvés (envoi, échec, renvoi, test)", async () => {
    // Base créée avant cette version : colonnes absentes, ajoutées au prochain démarrage.
    await conn.query("ALTER TABLE bos_agent_actions DROP COLUMN email_cible, DROP COLUMN exec_statut");
    await reconnect();

    const { decideAction, retryAction } = await import("@/lib/actions/execute");
    const { startSmtpSink } = await import("@/lib/testing/smtp-sink");
    const client = (await repo.getClients()).find((c) => c.nom === "TechBridge")!;
    const sansEmail = await repo.createClient({ nom: "Sans Adresse", statut: "prospect" });
    assert.ok(sansEmail.ok);
    if (!sansEmail.ok) return;
    const invoice = await repo.createInvoice({ clientId: sansEmail.value.id, montantHT: 10, tauxTva: 20, status: "emise", emiseLe: iso(0), echeance: iso(0) });
    assert.ok(invoice.ok);
    if (!invoice.ok) return;
    const draft = (cible: "client" | "facture", refId: string) => ({
      type: "suivi",
      description: "Écrire",
      requiresHitl: true,
      email: { cible, refId, objet: "Votre projet d'agent IA", corps: "Bonjour,\n\nL'équipe Jamaliance" },
    });
    const run = await repo.recordAgentRun(
      "agt-001",
      {
        resume: "r",
        actions: [draft("client", client.id), draft("facture", invoice.value.id), draft("client", client.id)],
      },
      "modele-test",
    );
    const [ok, sansAdresse, test] = run!.actions.map((a) => a.id);
    assert.equal((await repo.getAgentActions()).find((a) => a.id === ok)?.email?.cible, "client");

    const keys = ["SMTP_HOST", "SMTP_PORT", "SMTP_FROM", "BOS_EMAIL_REDIRECTION"] as const;
    const before = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
    const failing = await startSmtpSink({ fail: true });
    const sink = await startSmtpSink();
    try {
      // Sans SMTP : approuvé, à envoyer à la main.
      for (const k of keys) delete process.env[k];
      const first = await decideAction(repo, ok, "approved", { objet: "Point d'étape" });
      assert.equal(first.execution?.statut, "a_faire");
      assert.match(first.execution!.message, /li@techbridge\.example/);

      // SMTP qui refuse : échec enregistré.
      process.env.SMTP_HOST = "127.0.0.1";
      process.env.SMTP_FROM = "Jamaliance <contact@jamaliance.com>";
      process.env.SMTP_PORT = String(failing.port);
      assert.equal((await retryAction(repo, ok)).statut, "echec");

      // Renvoi vers un SMTP qui accepte : envoyé une fois, plus de renvoi possible.
      process.env.SMTP_PORT = String(sink.port);
      const sent = await retryAction(repo, ok);
      assert.equal(sent.statut, "envoye");
      assert.equal(sink.mails.length, 1);
      assert.deepEqual(sink.mails[0].to, ["<li@techbridge.example>"]);
      await assert.rejects(() => retryAction(repo, ok));
      const stored = (await repo.getAgentActions()).find((a) => a.id === ok)!;
      assert.equal(stored.execution?.statut, "envoye");
      assert.equal(stored.email?.objet, "Point d'étape");

      // Facture d'un client sans adresse : échec explicite, rien n'est envoyé.
      const noAddress = await decideAction(repo, sansAdresse, "approved");
      assert.equal(noAddress.execution?.statut, "echec");
      assert.match(noAddress.execution!.message, /Pas d'adresse e-mail pour le client Sans Adresse/);

      // Mode test : redirigé vers l'adresse de test.
      process.env.BOS_EMAIL_REDIRECTION = "moi@jamaliance.com";
      const redirected = await decideAction(repo, test, "approved");
      assert.equal(redirected.execution?.statut, "envoye");
      assert.deepEqual(sink.mails[1].to, ["<moi@jamaliance.com>"]);
      assert.match(redirected.execution!.message, /Mode test/);
    } finally {
      for (const k of keys) {
        if (before[k] === undefined) delete process.env[k];
        else process.env[k] = before[k];
      }
      await failing.close();
      await sink.close();
    }
  });

  it("gère les comptes, le journal et l'auteur des décisions", async () => {
    await conn.query("ALTER TABLE bos_agent_actions DROP COLUMN decide_par, DROP COLUMN decide_le");
    await reconnect();

    const user = await repo.createUser({ email: "Admin@Jamaliance.com", nom: "Admin Test", role: "admin", passwordHash: "scrypt$h" });
    assert.equal(user?.email, "admin@jamaliance.com");
    assert.equal(user?.actif, true);
    assert.equal(await repo.createUser({ email: "admin@jamaliance.com", nom: "Doublon", role: "membre", passwordHash: "x" }), null);
    const login = await repo.findUserForLogin("ADMIN@jamaliance.com");
    assert.equal(login?.passwordHash, "scrypt$h");
    assert.equal(JSON.stringify(await repo.listUsers()).includes("scrypt"), false, "le hash ne sort pas");

    const updated = await repo.updateUser(user!.id, { nom: "Admin Renommé", actif: false, passwordHash: "scrypt$h2" });
    assert.equal(updated?.nom, "Admin Renommé");
    assert.equal(updated?.actif, false);
    assert.equal((await repo.findUserForLogin("admin@jamaliance.com"))?.passwordHash, "scrypt$h2");
    await repo.touchLogin(user!.id);
    assert.ok((await repo.findUserById(user!.id))?.derniereConnexion);

    await repo.recordAudit({ id: "aud-1", le: "2026-10-27T08:00:00.000Z", utilisateurId: user!.id, utilisateur: "Admin", action: "connexion", objet: "admin@jamaliance.com", ip: "203.0.113.5" });
    await repo.recordAudit({ id: "aud-2", le: "2026-10-27T09:00:00.000Z", utilisateurId: "anonyme", utilisateur: "Anonyme", action: "connexion_echouee", objet: "x", details: '{"a":1}' });
    assert.deepEqual((await repo.getAudit()).map((e) => e.id).slice(0, 2), ["aud-2", "aud-1"]);
    assert.deepEqual((await repo.getAudit({ utilisateurId: user!.id })).map((e) => e.id), ["aud-1"]);
    assert.deepEqual((await repo.getAudit({ action: "connexion_echouee" }))[0].details, '{"a":1}');
    assert.equal((await repo.getAudit({ action: "connexion" }))[0].ip, "203.0.113.5");

    const run = await repo.recordAgentRun(
      "agt-001",
      { resume: "r", actions: [{ type: "t", description: "d", requiresHitl: true }] },
      "m",
    );
    const decided = await repo.resolveHitl(run!.actions[0].id, "approved", undefined, "Camille Martin");
    assert.equal(decided?.decidePar, "Camille Martin");
    const stored = (await repo.getAgentActions()).find((a) => a.id === run!.actions[0].id)!;
    assert.equal(stored.decidePar, "Camille Martin");
    assert.ok(stored.decideLe);
  });
  it("migre puis applique les changements de statut approuvés (client, mission, facture)", async () => {
    await conn.query("ALTER TABLE bos_agent_actions DROP COLUMN op_type, DROP COLUMN op_ref, DROP COLUMN op_valeur");
    await reconnect();

    const { decideAction } = await import("@/lib/actions/execute");
    const client = (await repo.getClients()).find((c) => c.nom === "TechBridge")!;
    const mission = (await repo.getMissions()).find((m) => m.statut === "en_cours")!;
    const invoice = (await repo.getInvoices()).find((i) => i.status === "emise")!;
    const op = (type: "statut_client" | "statut_mission" | "statut_facture", refId: string, valeur: string) => ({
      type: "statut",
      description: "Changer le statut",
      requiresHitl: true,
      operation: { type, refId, valeur },
    });
    const run = await repo.recordAgentRun(
      "agt-002",
      {
        resume: "r",
        actions: [
          op("statut_facture", invoice.id, "relance"),
          op("statut_mission", mission.id, "livree"),
          op("statut_client", client.id, "inactif"),
          {
            ...op("statut_mission", "mis-inexistante", "livree"),
            email: { cible: "client" as const, refId: client.id, objet: "x", corps: "y" },
          },
        ],
      },
      "m",
    );
    const [facture, mis, cli, fantome] = run!.actions.map((a) => a.id);
    const stored = (await repo.getAgentActions()).find((a) => a.id === facture)!;
    assert.deepEqual(stored.operation, { type: "statut_facture", refId: invoice.id, valeur: "relance" });
    assert.equal((await repo.findOperationTarget(stored.operation!))?.libelle, `Facture ${invoice.numero} (${invoice.client})`);

    // Valeur modifiée à l'approbation (autorisée), puis valeur interdite ignorée.
    const f = await decideAction(repo, facture, "approved", { valeur: "impayee" });
    assert.equal(f.execution?.statut, "fait");
    assert.equal((await repo.getInvoices()).find((i) => i.id === invoice.id)?.status, "impayee");
    const m = await decideAction(repo, mis, "approved", { valeur: "annulee" });
    assert.equal(m.operation?.valeur, "livree");
    assert.equal((await repo.getMissions()).find((x) => x.id === mission.id)?.statut, "livree");
    await decideAction(repo, cli, "approved");
    assert.equal((await repo.getClients()).find((c) => c.id === client.id)?.statut, "inactif");

    // Fiche introuvable : échec, et l'e-mail associé n'est pas tenté.
    const ko = await decideAction(repo, fantome, "approved");
    assert.equal(ko.execution?.statut, "echec");
    assert.match(ko.execution!.message, /Fiche introuvable/);
    assert.doesNotMatch(ko.execution!.message, /SMTP|envoy/i);
  });

  it("sépare les espaces : contacts, devis, factures et paiements d'un seul client", async () => {
    const a = await repo.createClient({ nom: "Espace A", statut: "actif", notes: "interne A" });
    const b = await repo.createClient({ nom: "Espace B", statut: "actif" });
    assert.ok(a.ok && b.ok);
    if (!a.ok || !b.ok) return;
    const ca = await repo.createContact({ clientId: a.value.id, nom: "Alice", categorie: "interlocuteur", principal: true, email: "alice@a.example" });
    const ca2 = await repo.createContact({ clientId: a.value.id, nom: "Arthur", categorie: "client", principal: false });
    await repo.createContact({ clientId: b.value.id, nom: "Bruno", categorie: "interlocuteur", principal: true });
    assert.ok(ca.ok && ca2.ok);
    if (!ca.ok || !ca2.ok) return;
    // Nouveau principal : l'ancien perd ce rôle, l'autre espace n'est pas touché.
    const promoted = await repo.updateContact(ca2.value.id, { principal: true, telephone: "06 00 00 00 00" });
    assert.ok(promoted.ok);
    const contacts = await repo.getContacts();
    assert.deepEqual(contacts.filter((c) => c.clientId === a.value.id && c.principal).map((c) => c.nom), ["Arthur"]);
    assert.ok(contacts.find((c) => c.nom === "Bruno")?.principal);
    assert.equal((await repo.updateContact("inconnu", { nom: "x" })).ok, false);

    const lignes = [
      { designation: "Secrétaire IA — mise en place", quantite: 1, prixUnitaireHT: 1500 },
      { designation: "Standard téléphonique — mois", quantite: 3, prixUnitaireHT: 99.9 },
    ];
    const qa = await repo.createQuote({ clientId: a.value.id, objet: "Secrétaire IA", lignes, tauxTva: 20, status: "envoye", emisLe: iso(2), valableJusquau: iso(-28) });
    const qb = await repo.createQuote({ clientId: b.value.id, objet: "Devis B", lignes, tauxTva: 20, status: "brouillon", emisLe: iso(2), valableJusquau: iso(-28) });
    assert.ok(qa.ok && qb.ok);
    if (!qa.ok || !qb.ok) return;
    assert.match(qa.value.numero, /^DEV-\d{4}-0001$/);
    assert.equal(qb.value.numero.endsWith("0002"), true);
    assert.deepEqual(qa.value.lignes, lignes, "lignes relues à l'identique");
    assert.equal(qa.value.montantHT, 1799.7);
    assert.equal(qa.value.montantTTC, 2159.64);

    assert.equal((await repo.invoiceQuote(qa.value.id)).ok, false, "pas encore accepté");
    assert.ok((await repo.updateQuoteStatus(qa.value.id, "accepte")).ok);
    const twice = await Promise.all([repo.invoiceQuote(qa.value.id), repo.invoiceQuote(qa.value.id)]);
    assert.equal(twice.filter((r) => r.ok).length, 1, "double clic : une seule facture");
    const done = twice.find((r) => r.ok)!;
    if (!done.ok) return;
    assert.equal(done.value.quote.status, "facture");
    assert.equal(done.value.quote.factureId, done.value.invoice.id);
    assert.equal(done.value.invoice.montantTTC, 2159.64);
    assert.equal((await repo.updateQuoteStatus(qa.value.id, "refuse")).ok, false, "devis facturé verrouillé");
    const paid = await repo.recordPayment({ factureId: done.value.invoice.id, montant: 500, date: iso(0), mode: "stripe" });
    assert.ok(paid.ok);
    const ib = await repo.createInvoice({ clientId: b.value.id, montantHT: 10, tauxTva: 20, status: "emise", emiseLe: iso(0), echeance: iso(0) });
    assert.ok(ib.ok);
    if (ib.ok) await repo.recordPayment({ factureId: ib.value.id, montant: 12, date: iso(0), mode: "paypal" });

    const space = (await repo.getSpace(a.value.id))!;
    assert.deepEqual(space.contacts.map((c) => c.nom).sort(), ["Alice", "Arthur"]);
    assert.deepEqual(space.quotes.map((q) => q.objet), ["Secrétaire IA"]);
    assert.deepEqual(space.invoices.map((i) => i.id), [done.value.invoice.id]);
    assert.deepEqual(space.payments.map((p) => p.mode), ["stripe"]);
    assert.equal(JSON.stringify(space).includes("Espace B"), false);
    assert.equal(JSON.stringify(space).includes("Bruno"), false);
    assert.equal(await repo.getSpace("inconnu"), null);
  });

  it("migre les comptes et rattache un compte client à son entreprise", async () => {
    await conn.query("ALTER TABLE bos_users DROP COLUMN client_id");
    await reconnect();
    const a = (await repo.getClients()).find((c) => c.nom === "Espace A")!;
    const user = await repo.createUser({ email: "portail@a.example", nom: "Portail A", role: "client", clientId: a.id, passwordHash: "scrypt$x" });
    assert.equal(user?.role, "client");
    assert.equal(user?.clientId, a.id);
    const staff = await repo.createUser({ email: "staff@jamaliance.com", nom: "Staff", role: "membre", clientId: a.id, passwordHash: "scrypt$x" });
    assert.equal(staff?.clientId, undefined, "un compte de l'équipe n'a jamais d'espace");
    const { resolveActor } = await import("@/lib/session");
    assert.deepEqual(await resolveActor({ uid: user!.id, role: "client", nom: "Portail A" }), {
      id: user!.id,
      nom: "Portail A",
      role: "client",
      clientId: a.id,
      secours: false,
    });
  });
});
