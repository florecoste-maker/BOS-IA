import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { store } from "./store";

describe("BOS-IA System of Record", () => {
  it("expose des métriques dashboard cohérentes", () => {
    const m = store.getMetrics();
    assert.ok(m.apprenantsActifs >= 1);
    assert.ok(m.agentsActifs >= 1);
    assert.equal(typeof m.mrr, "number"); // valeur fixe en démonstration
  });

  it("détecte les ghost learners", () => {
    const ghosts = store.getLearners().filter((l) => l.status === "inactif");
    assert.ok(ghosts.length >= 1);
    assert.equal(store.getMetrics().ghostLearners, ghosts.length);
  });

  it("valide la compréhension (≥ 70)", () => {
    const learner = store.getLearners().find((l) => !l.comprehensionValidee);
    assert.ok(learner);
    const updated = store.validateComprehension(learner!.id, 85);
    assert.equal(updated?.comprehensionValidee, true);
    assert.equal(updated?.pipelineStage, "certification");
  });

  it("orchestre proof-to-cash après validation", () => {
    const ready = store
      .getLearners()
      .find((l) => l.comprehensionValidee && l.pipelineStage !== "completion");
    assert.ok(ready);
    const result = store.emitProofToCash(ready!.id);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.ok(result.invoice);
      assert.equal(result.completion_record.learnerId, ready!.id);
    }
  });

  it("exige HITL pour actions à risque", () => {
    const pending = store
      .getAgentActions()
      .find((a) => a.hitlStatus === "pending");
    assert.ok(pending);
    const resolved = store.resolveHitl(pending!.id, "approved");
    assert.equal(resolved?.hitlStatus, "approved");
  });
});
