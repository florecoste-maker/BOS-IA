import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Anthropic from "@anthropic-ai/sdk";
import { buildAgentContext, describeClaudeError, normalizeProposal } from "./claude";
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

  it("garde un brouillon d'e-mail seulement vers un client ou une facture connus, en HITL", () => {
    const refs = { clients: new Set(["cli-001"]), factures: new Set(["inv-003"]) };
    const draft = { cible: "client" as const, refId: "cli-001", objet: " Suivi ", corps: " Bonjour " };
    const out = normalizeProposal(
      libre,
      {
        resume: "r",
        actions: [
          { type: "suivi", description: "Écrire", requiresHitl: false, email: draft },
          { type: "inconnu", description: "Écrire", requiresHitl: false, email: { ...draft, refId: "cli-999" } },
          { type: "facture", description: "Relancer", requiresHitl: false, email: { ...draft, cible: "facture", refId: "inv-001" } },
          { type: "ancien", description: "Écrire", requiresHitl: false, email: { ...draft, cible: "apprenant" } as never },
        ],
      },
      refs,
    );
    assert.deepEqual(out.actions[0].email, { cible: "client", refId: "cli-001", objet: "Suivi", corps: "Bonjour" });
    assert.equal(out.actions[0].requiresHitl, true, "un e-mail passe toujours par la validation humaine");
    assert.equal(out.actions[1].email, undefined, "id inconnu écarté");
    assert.equal(out.actions[2].email, undefined, "facture sans adresse client écartée");
    assert.equal(out.actions[1].requiresHitl, false);
    assert.equal(out.actions.length, 3, "au plus 3 actions");
    const sansRefs = normalizeProposal(libre, { resume: "r", actions: [{ type: "t", description: "d", requiresHitl: false, email: draft }] });
    assert.equal(sansRefs.actions[0].email, undefined);
  });

  it("garde un changement de statut seulement vers une fiche connue et une valeur autorisée", () => {
    const refs = {
      clients: new Set<string>(),
      factures: new Set<string>(),
      tousClients: new Set(["cli-004"]),
      missions: new Set(["mis-002"]),
      toutesFactures: new Set(["inv-003"]),
    };
    const act = (operation: unknown) => ({ type: "t", description: "d", requiresHitl: false, operation }) as never;
    const out = normalizeProposal(
      libre,
      {
        resume: "r",
        actions: [
          act({ type: "statut_client", refId: "cli-004", valeur: "inactif" }),
          act({ type: "statut_facture", refId: "inv-003", valeur: "payee" }), // geste humain
          act({ type: "statut_mission", refId: "mis-002", valeur: "annulee" }), // geste humain
        ],
      },
      refs,
    );
    assert.deepEqual(out.actions[0].operation, { type: "statut_client", refId: "cli-004", valeur: "inactif" });
    assert.equal(out.actions[0].requiresHitl, true, "un changement de statut passe par la validation humaine");
    assert.equal(out.actions[1].operation, undefined);
    assert.equal(out.actions[2].operation, undefined);

    const others = normalizeProposal(
      libre,
      {
        resume: "r",
        actions: [
          act({ type: "statut_mission", refId: "mis-999", valeur: "livree" }), // fiche inconnue
          act({ type: "statut_apprenant", refId: "cli-004", valeur: "inactif" }), // type inconnu
          act({ type: "statut_mission", refId: "mis-002", valeur: "livree" }),
        ],
      },
      refs,
    );
    assert.equal(others.actions[0].operation, undefined);
    assert.equal(others.actions[1].operation, undefined);
    assert.equal(others.actions[2].operation?.valeur, "livree");
    const relance = normalizeProposal(libre, { resume: "r", actions: [act({ type: "statut_facture", refId: "inv-003", valeur: "relance" })] }, refs);
    assert.equal(relance.actions[0].operation?.valeur, "relance");
  });

  it("ne transmet au modèle ni adresse, ni téléphone, ni référence bancaire", async () => {
    const context = await buildAgentContext(await getRepository());
    const json = JSON.stringify(context);
    assert.equal(json.includes("@"), false);
    assert.ok(context.clients.length > 0 && context.missions.length > 0 && context.paiements.length > 0);
    assert.ok(context.clients.every((c) => !("email" in c) && !("telephone" in c) && typeof c.emailConnu === "boolean"));
    assert.ok(context.factures.every((f) => !("emailClient" in f) && typeof f.emailClientConnu === "boolean"));
    assert.ok(context.paiements.every((p) => !("reference" in p)));
    assert.equal(json.includes("01 23 45 67 89"), false);
  });
});

describe("Erreurs de l'API Claude expliquées", () => {
  it("crédit épuisé, clé refusée, autre erreur", () => {
    const credit = new Anthropic.BadRequestError(
      400,
      { type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API." } },
      "Your credit balance is too low to access the Anthropic API.",
      new Headers(),
    );
    assert.match(describeClaudeError(credit)!.message, /Crédit Anthropic épuisé/);
    const auth = new Anthropic.AuthenticationError(401, undefined, "invalid x-api-key", new Headers());
    assert.match(describeClaudeError(auth)!.message, /refusée/);
    assert.equal(describeClaudeError(new Error("x")), null);
  });
});

describe("Repère de la clé API (jamais la clé)", () => {
  it("garde le préfixe de format et les 4 derniers caractères", async () => {
    const { keyHint } = await import("./claude");
    assert.equal(keyHint("sk-ant-api03-abcdefghijklmnopqrstuvwxyz-WXYZ"), "sk-ant-api03-…WXYZ");
    assert.equal(keyHint("cle-sans-format-connu-1234"), "…1234");
    assert.equal(keyHint("court"), null);
    assert.equal(keyHint(null), null);
  });
});

describe("Clé API : celle du cockpit est prioritaire", () => {
  it("BOS_ANTHROPIC_API_KEY (cockpit) passe devant ANTHROPIC_API_KEY (recopie GitHub)", async () => {
    const { getAgentsConfig } = await import("./claude");
    const avant = { a: process.env.ANTHROPIC_API_KEY, b: process.env.BOS_ANTHROPIC_API_KEY };
    try {
      process.env.ANTHROPIC_API_KEY = "sk-ant-usr-ancienne";
      delete process.env.BOS_ANTHROPIC_API_KEY;
      assert.equal(getAgentsConfig().apiKey, "sk-ant-usr-ancienne");
      process.env.BOS_ANTHROPIC_API_KEY = "sk-ant-api03-nouvelle";
      assert.equal(getAgentsConfig().apiKey, "sk-ant-api03-nouvelle");
    } finally {
      for (const [k, v] of [["ANTHROPIC_API_KEY", avant.a], ["BOS_ANTHROPIC_API_KEY", avant.b]] as const) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });
});
