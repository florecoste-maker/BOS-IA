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

  it("garde un changement de statut seulement vers une fiche connue et une valeur autorisée", () => {
    const refs = {
      apprenants: new Set(["lrn-003"]),
      factures: new Set<string>(),
      toutesFactures: new Set(["inv-003"]),
      dossiers: new Set(["opco-002"]),
    };
    const act = (operation: unknown) => ({ type: "t", description: "d", requiresHitl: false, operation }) as never;
    const out = normalizeProposal(
      libre,
      {
        resume: "r",
        actions: [
          act({ type: "statut_apprenant", refId: "lrn-003", valeur: "inactif" }),
          act({ type: "statut_facture", refId: "inv-003", valeur: "payee" }), // geste humain
          act({ type: "statut_apprenant", refId: "lrn-003", valeur: "certifie" }), // geste humain
        ],
      },
      refs,
    );
    assert.deepEqual(out.actions[0].operation, { type: "statut_apprenant", refId: "lrn-003", valeur: "inactif" });
    assert.equal(out.actions[0].requiresHitl, true, "un changement de statut passe par la validation humaine");
    assert.equal(out.actions[1].operation, undefined);
    assert.equal(out.actions[2].operation, undefined);

    const others = normalizeProposal(
      libre,
      {
        resume: "r",
        actions: [
          act({ type: "statut_dossier", refId: "opco-999", valeur: "transmis" }), // fiche inconnue
          act({ type: "supprimer_tout", refId: "lrn-003", valeur: "inactif" }), // type inconnu
          act({ type: "statut_dossier", refId: "opco-002", valeur: "transmis" }),
        ],
      },
      refs,
    );
    assert.equal(others.actions[0].operation, undefined);
    assert.equal(others.actions[1].operation, undefined);
    assert.equal(others.actions[2].operation?.valeur, "transmis");
  });

  it("n'envoie pas les e-mails des apprenants au modèle", async () => {
    const context = await buildAgentContext(await getRepository());
    assert.equal(JSON.stringify(context).includes("@"), false);
    assert.ok(context.factures.every((f) => !("emailClient" in f) && typeof f.emailClientConnu === "boolean"));
  });
});
