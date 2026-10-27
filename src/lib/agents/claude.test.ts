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

  it("garde un brouillon d'e-mail seulement vers un apprenant ou une facture connus, en HITL", () => {
    const refs = { apprenants: new Set(["lrn-001"]), factures: new Set(["inv-003"]) };
    const draft = { cible: "apprenant" as const, refId: "lrn-001", objet: " Reprise ", corps: " Bonjour " };
    const out = normalizeProposal(
      libre,
      {
        resume: "r",
        actions: [
          { type: "relance", description: "Relancer", requiresHitl: false, email: draft },
          { type: "inconnu", description: "Écrire", requiresHitl: false, email: { ...draft, refId: "lrn-999" } },
          { type: "facture", description: "Relancer", requiresHitl: false, email: { ...draft, cible: "facture", refId: "inv-001" } },
        ],
      },
      refs,
    );
    assert.deepEqual(out.actions[0].email, { cible: "apprenant", refId: "lrn-001", objet: "Reprise", corps: "Bonjour" });
    assert.equal(out.actions[0].requiresHitl, true, "un e-mail passe toujours par la validation humaine");
    assert.equal(out.actions[1].email, undefined, "id inconnu écarté");
    assert.equal(out.actions[2].email, undefined, "facture sans adresse client écartée");
    assert.equal(out.actions[1].requiresHitl, false);
    const sansRefs = normalizeProposal(libre, { resume: "r", actions: [{ type: "t", description: "d", requiresHitl: false, email: draft }] });
    assert.equal(sansRefs.actions[0].email, undefined);
  });

  it("n'envoie pas les e-mails des apprenants au modèle", async () => {
    const context = await buildAgentContext(await getRepository());
    assert.equal(JSON.stringify(context).includes("@"), false);
    assert.ok(context.factures.every((f) => !("emailClient" in f) && typeof f.emailClientConnu === "boolean"));
  });
});
