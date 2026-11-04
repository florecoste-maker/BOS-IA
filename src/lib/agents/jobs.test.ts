import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { finishJob, getJob, runningJobFor, startJob } from "./jobs";

describe("Analyses IA en arrière-plan", () => {
  it("suit une analyse de son lancement à son résultat", () => {
    const id = startJob("agent-a");
    assert.equal(getJob(id)?.statut, "en_cours");
    assert.equal(runningJobFor("agent-a"), id, "un double clic reprend la même analyse");
    finishJob(id, { run: { actions: [] } });
    assert.equal(getJob(id)?.statut, "succes");
    assert.equal(runningJobFor("agent-a"), null);
  });

  it("garde la raison d'un échec (crédit épuisé, clé refusée…)", () => {
    const id = startJob("agent-b");
    finishJob(id, { erreur: "Crédit Anthropic épuisé", code: 402 });
    const job = getJob(id);
    assert.equal(job?.statut, "echec");
    assert.equal(job?.statut === "echec" && job.erreur, "Crédit Anthropic épuisé");
  });

  it("oublie les analyses de plus d'une heure, et ignore un identifiant inconnu", () => {
    const vieux = startJob("agent-c", Date.now() - 2 * 60 * 60 * 1000);
    startJob("agent-d");
    assert.equal(getJob(vieux), null);
    assert.equal(getJob("analyse-inconnue"), null);
    finishJob("analyse-inconnue", { run: null });
  });
});
