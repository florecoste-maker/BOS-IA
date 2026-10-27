import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAgentContext, normalizeProposal } from "./claude";
import { getRepository } from "../data";
import { store } from "../store";

describe("Garde-fous des agents IA", () => {
  const agents = store.getAgents();
  const risque = agents.find((a) => a.hitlObligatoire)!;
  const libre = agents.find((a) => !a.hitlObligatoire && a.risque !== "eleve")!;

  it("force la validation humaine pour un agent HITL obligatoire", () => {
    const out = normalizeProposal(risque, {
      resume: " ok ",
      actions: [{ type: "relance", description: "Relancer", requiresHitl: false }],
    });
    assert.equal(out.resume, "ok");
    assert.equal(out.actions[0].requiresHitl, true);
  });

  it("limite à 3 actions et ignore les actions vides", () => {
    const action = { type: "t", description: "d", requiresHitl: false };
    const out = normalizeProposal(libre, {
      resume: "r",
      actions: [{ ...action, description: " " }, action, action, action, action],
    });
    assert.equal(out.actions.length, 3);
    assert.equal(out.actions[0].requiresHitl, false);
  });

  it("n'envoie pas les e-mails des apprenants au modèle", async () => {
    const context = await buildAgentContext(await getRepository());
    assert.equal(JSON.stringify(context).includes("@"), false);
  });
});
