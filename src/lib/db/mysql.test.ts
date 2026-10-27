/**
 * Test d'intégration sur une vraie base MySQL / MariaDB.
 * Ignoré sans BOS_TEST_DATABASE_URL (ex. mysql://bos:mdp@127.0.0.1:3306/bosia_test).
 * ATTENTION : supprime les tables bos_* de cette base.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import mysql from "mysql2/promise";

const url = process.env.BOS_TEST_DATABASE_URL;

describe("Moteur MySQL", { skip: !url && "BOS_TEST_DATABASE_URL non défini" }, () => {
  let repo: typeof import("./mysql").mysqlRepository;
  let conn: mysql.Connection;

  before(async () => {
    process.env.DATABASE_URL = url;
    conn = await mysql.createConnection(url!);
    for (const t of [
      "bos_agent_actions",
      "bos_agents",
      "bos_invoices",
      "bos_opco_dossiers",
      "bos_learners",
      "bos_sessions",
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
    assert.equal((await repo.getLearners()).length, 0);
    assert.equal((await repo.getInvoices()).length, 0);
    const metrics = await repo.getMetrics();
    assert.equal(metrics.mrr, null);
    assert.equal(metrics.delaiPaiementMoyen, null);
    assert.equal(metrics.agentsActifs, 6);
  });

  it("enregistre une analyse d'agent et la file HITL de façon persistante", async () => {
    const run = await repo.recordAgentRun(
      "agt-005",
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

    const actions = await repo.getAgentActions();
    const pending = actions.find((a) => a.hitlStatus === "pending");
    assert.ok(pending);
    assert.equal((await repo.getAgents()).find((a) => a.id === "agt-005")?.status, "en_attente_hitl");

    const resolved = await repo.resolveHitl(pending!.id, "approved");
    assert.equal(resolved?.hitlStatus, "approved");
    const agent = (await repo.getAgents()).find((a) => a.id === "agt-005");
    assert.equal(agent?.status, "actif");
    assert.match(agent!.derniereAction, /HITL approuvé/);
    assert.equal(await repo.resolveHitl("act-inexistante", "approved"), null);
  });

  it("enchaîne validation et proof-to-cash avec numérotation des factures", async () => {
    await conn.query(
      `INSERT INTO bos_sessions VALUES
        ('ses-1','Google Workspace','GWS-7H','2026-10-01','2026-10-08','A. Formateur',10,1,'en_cours','["I4","I11"]')`,
    );
    await conn.query(
      `INSERT INTO bos_learners VALUES
        ('lrn-1','Durand','Alex','alex@exemple.fr','Atelier','en_formation','parcours','ses-1',
         '2026-10-20 10:00:00.000',0,NULL,'2026-10-01 09:00:00.000')`,
    );
    await conn.query(
      `INSERT INTO bos_opco_dossiers VALUES
        ('opco-1','OPCO-1','AKTO','lrn-1','ses-1',1490.00,'completude',70,'["Attestation"]','2026-10-20 10:00:00.000')`,
    );

    const sessions = await repo.getSessions();
    assert.deepEqual(sessions[0].qualiopiIndicateurs, ["I4", "I11"]);

    const refused = await repo.emitProofToCash("lrn-1");
    assert.equal(refused.ok, false);

    const validated = await repo.validateComprehension("lrn-1", 82);
    assert.equal(validated?.comprehensionValidee, true);
    assert.equal(validated?.pipelineStage, "certification");

    const result = await repo.emitProofToCash("lrn-1");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.match(result.invoice.numero, /^FA-\d{4}-0001$/);
    assert.equal(result.invoice.montantHT, 1490);
    assert.equal(result.dossier?.status, "accepte");

    const learner = (await repo.getLearners())[0];
    assert.equal(learner.status, "certifie");
    assert.equal(learner.pipelineStage, "completion");

    await conn.query(
      `INSERT INTO bos_invoices (id, numero, client, dossier_opco_id, montant_ht, acompte_pct, status, emise_le, echeance)
       VALUES ('inv-old','FA-2020-0001','Ancien',NULL,100,30,'emise','2020-01-01','2020-01-31')`,
    );
    const invoices = await repo.getInvoices();
    assert.ok(invoices.find((i) => i.id === "inv-old")!.joursRetard > 0);
    assert.equal((await repo.getMetrics()).facturesEnRetard, 1);

    const second = await repo.updateLearnerStatus("lrn-1", "certifie");
    assert.equal(second?.status, "certifie");
    assert.equal(await repo.updateLearnerStatus("inconnu", "inscrit"), null);

    const dossier = await repo.completeOpcoDossier("opco-1");
    assert.equal(dossier?.status, "transmis");
    assert.deepEqual(dossier?.piecesManquantes, []);
  });

  it("survit à un nouveau pool (données persistées)", async () => {
    const state = (globalThis as { __bosDb?: { pool: { end(): Promise<void> } } }).__bosDb;
    await state?.pool.end();
    (globalThis as { __bosDb?: unknown }).__bosDb = undefined;
    assert.equal((await repo.getLearners()).length, 1);
    assert.equal((await repo.getAgentActions()).length, 2);
  });

  it("importe sessions, apprenants, dossiers et factures (vérifier puis importer)", async () => {
    const { importIntoDatabase } = await import("./import");
    const { parseImport } = await import("@/lib/import/schema");
    const parse = (kind: Parameters<typeof parseImport>[0], table: string[][]) => {
      const parsed = parseImport(kind, table);
      assert.deepEqual(parsed.errors, []);
      return parsed.rows;
    };

    const sessions = parse("sessions", [
      ["code", "titre", "debut", "fin", "formateur", "places", "statut"],
      ["IMP-1", "Import test", "03/11/2026", "04/11/2026", "B. Test", "8", "Planifiée"],
      ["ses-1-maj", "Mise à jour", "01/10/2026", "08/10/2026", "C. Test", "9", ""],
    ]);
    const check = await importIntoDatabase("sessions", sessions, { dryRun: true });
    assert.deepEqual(check, { created: 2, updated: 0, errors: [], committed: false });
    assert.equal((await repo.getSessions()).length, 1, "la vérification n'écrit rien");

    const done = await importIntoDatabase("sessions", sessions, { dryRun: false });
    assert.equal(done.committed, true);
    assert.equal((await repo.getSessions()).length, 3);

    // Mise à jour par clé : cellule vide = valeur conservée.
    const update = parse("sessions", [
      ["code", "titre", "debut", "fin", "formateur", "places", "statut"],
      ["IMP-1", "Import test v2", "03/11/2026", "04/11/2026", "B. Test", "8", ""],
    ]);
    assert.deepEqual(
      await importIntoDatabase("sessions", update, { dryRun: false }),
      { created: 0, updated: 1, errors: [], committed: true },
    );
    const imp = (await repo.getSessions()).find((s) => s.code === "IMP-1")!;
    assert.equal(imp.titre, "Import test v2");
    assert.equal(imp.statut, "planifiee");

    // Une référence introuvable annule tout le fichier.
    const learners = parse("apprenants", [
      ["email", "nom", "prenom", "session_code"],
      ["nouvelle@exemple.fr", "Nouvelle", "Lina", "IMP-1"],
      ["perdu@exemple.fr", "Perdu", "Max", "INCONNUE"],
    ]);
    const refused = await importIntoDatabase("apprenants", learners, { dryRun: false });
    assert.equal(refused.committed, false);
    assert.deepEqual(refused.errors, [{ line: 3, message: "session « INCONNUE » introuvable" }]);
    assert.equal((await repo.getLearners()).length, 1);

    const ok = await importIntoDatabase("apprenants", learners.slice(0, 1), { dryRun: false });
    assert.equal(ok.created, 1);
    const lina = (await repo.getLearners()).find((l) => l.email === "nouvelle@exemple.fr")!;
    assert.equal(lina.status, "inscrit");
    assert.ok(lina.sessionId);

    const dossiers = parse("dossiers", [
      ["reference", "organisme", "apprenant_email", "session_code", "montant", "pieces_manquantes"],
      ["OPCO-IMP", "AKTO", "Nouvelle@Exemple.fr", "IMP-1", "1 490,50", "Attestation, signée|Programme"],
    ]);
    assert.equal((await importIntoDatabase("dossiers", dossiers, { dryRun: false })).created, 1);
    const d = (await repo.getOpcoDossiers()).find((x) => x.reference === "OPCO-IMP")!;
    assert.equal(d.montant, 1490.5);
    assert.deepEqual(d.piecesManquantes, ["Attestation, signée", "Programme"]);

    const factures = parse("factures", [
      ["numero", "client", "montant_ht", "emise_le", "echeance", "dossier_reference"],
      ["FA-IMP-1", "Client", "1490,50", "01/01/2026", "31/01/2026", "OPCO-IMP"],
    ]);
    assert.equal((await importIntoDatabase("factures", factures, { dryRun: false })).created, 1);
    const f = (await repo.getInvoices()).find((x) => x.numero === "FA-IMP-1")!;
    assert.equal(f.status, "emise");
    assert.equal(f.dossierOpcoId, d.id);
    assert.ok(f.joursRetard > 0);
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
    await conn.query("ALTER TABLE bos_invoices DROP COLUMN email_client");
    await conn.query("ALTER TABLE bos_agent_actions DROP COLUMN email_cible, DROP COLUMN exec_statut");
    const state = (globalThis as { __bosDb?: { pool: { end(): Promise<void> } } }).__bosDb;
    await state?.pool.end();
    (globalThis as { __bosDb?: unknown }).__bosDb = undefined;
    assert.ok((await repo.getInvoices()).length > 0, "lecture après migration");

    const { decideAction, retryAction } = await import("@/lib/actions/execute");
    const { startSmtpSink } = await import("@/lib/testing/smtp-sink");
    const learner = (await repo.getLearners()).find((l) => l.email === "nouvelle@exemple.fr")!;
    const invoice = (await repo.getInvoices()).find((i) => i.numero === "FA-IMP-1")!;
    const draft = (cible: "apprenant" | "facture", refId: string) => ({
      type: "relance",
      description: "Relancer",
      requiresHitl: true,
      email: { cible, refId, objet: "Votre formation", corps: "Bonjour,\n\nL'équipe Jamaliance" },
    });
    const run = await repo.recordAgentRun(
      "agt-004",
      {
        resume: "r",
        actions: [draft("apprenant", learner.id), draft("facture", invoice.id), draft("apprenant", learner.id)],
      },
      "modele-test",
    );
    const [ok, sansAdresse, test] = run!.actions.map((a) => a.id);
    assert.equal((await repo.getAgentActions()).find((a) => a.id === ok)?.email?.cible, "apprenant");

    const keys = ["SMTP_HOST", "SMTP_PORT", "SMTP_FROM", "BOS_EMAIL_REDIRECTION"] as const;
    const before = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
    const failing = await startSmtpSink({ fail: true });
    const sink = await startSmtpSink();
    try {
      // Sans SMTP : approuvé, à envoyer à la main.
      for (const k of keys) delete process.env[k];
      const first = await decideAction(repo, ok, "approved", { objet: "Reprise de votre parcours" });
      assert.equal(first.execution?.statut, "a_faire");
      assert.match(first.execution!.message, /nouvelle@exemple\.fr/);

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
      assert.deepEqual(sink.mails[0].to, ["<nouvelle@exemple.fr>"]);
      assert.match(sink.mails[0].data, /Reprise de votre parcours|UTF-8/);
      await assert.rejects(() => retryAction(repo, ok));
      const stored = (await repo.getAgentActions()).find((a) => a.id === ok)!;
      assert.equal(stored.execution?.statut, "envoye");
      assert.equal(stored.email?.objet, "Reprise de votre parcours");

      // Facture sans adresse client : échec explicite, rien n'est envoyé.
      const noAddress = await decideAction(repo, sansAdresse, "approved");
      assert.equal(noAddress.execution?.statut, "echec");
      assert.match(noAddress.execution!.message, /email_client/);

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

  it("importe dates de paiement et abonnements, puis calcule délai et MRR", async () => {
    await conn.query("ALTER TABLE bos_invoices DROP COLUMN payee_le, DROP COLUMN recurrence");
    const state = (globalThis as { __bosDb?: { pool: { end(): Promise<void> } } }).__bosDb;
    await state?.pool.end();
    (globalThis as { __bosDb?: unknown }).__bosDb = undefined;

    const { importIntoDatabase } = await import("./import");
    const { parseImport } = await import("@/lib/import/schema");
    const today = new Date();
    const iso = (daysAgo: number) => new Date(today.getTime() - daysAgo * 86_400_000).toISOString().slice(0, 10);
    const parsed = parseImport("factures", [
      ["numero", "client", "montant_ht", "emise_le", "echeance", "payee_le", "recurrence"],
      ["PAY-1", "A", "1000", iso(40), iso(10), iso(20), ""],
      ["PAY-2", "B", "500", iso(30), iso(0), iso(20), ""],
      ["ABO-1", "C", "120", iso(5), iso(-25), "", "Mensuel"],
      ["ABO-2", "D", "1 200", iso(60), iso(30), "", "annuel"],
    ]);
    assert.deepEqual(parsed.errors, []);
    const report = await importIntoDatabase("factures", parsed.rows, { dryRun: false });
    assert.equal(report.created, 4);

    const invoices = await repo.getInvoices();
    const pay1 = invoices.find((i) => i.numero === "PAY-1")!;
    assert.equal(pay1.status, "payee", "date de paiement sans statut = payée");
    assert.equal(pay1.payeeLe, iso(20));
    assert.equal(pay1.joursRetard, 0);
    assert.equal(invoices.find((i) => i.numero === "ABO-1")!.recurrence, "mensuel");

    // Délai : FA-IMP-1 et inv-old n'ont pas de date de paiement ; PAY-1 20 j, PAY-2 10 j.
    let metrics = await repo.getMetrics();
    assert.equal(metrics.delaiPaiementMoyen, 15);
    assert.equal(metrics.delaiPaiementBase, 2);
    assert.equal(metrics.mrr, 120 + 100);
    assert.equal(metrics.abonnementsActifs, 2);

    const old = invoices.find((i) => i.numero === "FA-2020-0001")!;
    assert.ok(old.joursRetard > 0);
    const paid = await repo.markInvoicePaid(old.id, iso(0));
    assert.equal(paid?.status, "payee");
    assert.equal(paid?.joursRetard, 0);
    assert.equal(await repo.markInvoicePaid("inconnue", iso(0)), null);
    metrics = await repo.getMetrics();
    assert.equal(metrics.delaiPaiementBase, 3, "payée aujourd'hui : comptée dans les 12 mois");
  });

  it("gère les comptes, le journal et l'auteur des décisions", async () => {
    await conn.query("ALTER TABLE bos_agent_actions DROP COLUMN decide_par, DROP COLUMN decide_le");
    const state = (globalThis as { __bosDb?: { pool: { end(): Promise<void> } } }).__bosDb;
    await state?.pool.end();
    (globalThis as { __bosDb?: unknown }).__bosDb = undefined;

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
});
