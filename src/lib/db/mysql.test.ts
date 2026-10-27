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
      "INSERT INTO bos_invoices VALUES ('inv-old','FA-2020-0001','Ancien',NULL,100,30,'emise','2020-01-01','2020-01-31')",
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
});
