import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { store } from "../store";
import type { AgentAction, AgentRunLog } from "../types";
import { getScheduleConfig, isCronAuthorized, planScheduledRun } from "./schedule";

const NOW = Date.parse("2026-10-27T06:17:00Z");
const agents = store.getAgents().map((a) => ({ ...a, status: "actif" as const }));

function run(agentId: string, hoursAgo: number, statut: AgentRunLog["statut"] = "succes"): AgentRunLog {
  const debut = new Date(NOW - hoursAgo * 3_600_000).toISOString();
  return { id: `r-${agentId}-${hoursAgo}`, agentId, declencheur: "planifie", debut, fin: debut, statut, message: "", actions: 0 };
}

function pending(agentId: string): AgentAction {
  return { id: `a-${agentId}`, agentId, type: "t", description: "d", timestamp: "", requiresHitl: true, hitlStatus: "pending" };
}

describe("Planification des agents", () => {
  it("lance tous les agents la première fois", () => {
    const plan = planScheduledRun({ agents, actions: [], runs: [], agentIds: [], intervalHours: 20, now: NOW });
    assert.equal(plan.length, 6);
    assert.ok(plan.every((p) => p.decision === "lancer" && p.raison === "première analyse"));
  });

  it("respecte l'intervalle minimal et relance un agent en échec", () => {
    const plan = planScheduledRun({
      agents,
      actions: [],
      runs: [run("agt-001", 2), run("agt-002", 21), run("agt-003", 1, "echec")],
      agentIds: [],
      intervalHours: 20,
      now: NOW,
    });
    const by = Object.fromEntries(plan.map((p) => [p.agentId, p]));
    assert.equal(by["agt-001"].decision, "ignorer");
    assert.match(by["agt-001"].raison, /déjà analysé/);
    assert.equal(by["agt-002"].decision, "lancer");
    assert.equal(by["agt-002"].raison, "intervalle écoulé");
    assert.equal(by["agt-003"].decision, "lancer");
  });

  it("n'empile pas de propositions tant que la file HITL de l'agent n'est pas traitée", () => {
    const decided: AgentAction = { ...pending("agt-004"), hitlStatus: "approved" };
    const plan = planScheduledRun({
      agents,
      actions: [pending("agt-005"), pending("agt-005"), decided],
      runs: [],
      agentIds: [],
      intervalHours: 20,
      now: NOW,
    });
    const by = Object.fromEntries(plan.map((p) => [p.agentId, p]));
    assert.equal(by["agt-005"].decision, "ignorer");
    assert.equal(by["agt-005"].raison, "2 proposition(s) en attente de validation");
    assert.equal(by["agt-004"].decision, "lancer");
  });

  it("limite aux agents choisis et ignore un agent en pause", () => {
    const paused = agents.map((a) => (a.id === "agt-002" ? { ...a, status: "pause" as const } : a));
    const plan = planScheduledRun({
      agents: paused,
      actions: [],
      runs: [],
      agentIds: ["agt-001", "agt-002"],
      intervalHours: 20,
      now: NOW,
    });
    assert.deepEqual(
      plan.map((p) => [p.agentId, p.decision]),
      [
        ["agt-001", "lancer"],
        ["agt-002", "ignorer"],
      ],
    );
  });
});

describe("Secret du planificateur", () => {
  const saved = {
    s: process.env.BOS_CRON_SECRET,
    a: process.env.BOS_AGENTS_PLANIFIES,
    h: process.env.BOS_AGENTS_INTERVALLE_HEURES,
  };
  afterEach(() => {
    for (const [k, v] of [
      ["BOS_CRON_SECRET", saved.s],
      ["BOS_AGENTS_PLANIFIES", saved.a],
      ["BOS_AGENTS_INTERVALLE_HEURES", saved.h],
    ] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("refuse tout sans secret ou avec un secret trop court", () => {
    delete process.env.BOS_CRON_SECRET;
    assert.equal(isCronAuthorized("Bearer x"), false);
    process.env.BOS_CRON_SECRET = "court";
    assert.equal(getScheduleConfig().secretTooShort, true);
    assert.equal(isCronAuthorized("Bearer court"), false);
  });

  it("n'accepte que le bon secret en Bearer", () => {
    const secret = "0123456789abcdef0123456789abcdef";
    process.env.BOS_CRON_SECRET = secret;
    assert.equal(isCronAuthorized(`Bearer ${secret}`), true);
    assert.equal(isCronAuthorized(`bearer  ${secret} `), true);
    assert.equal(isCronAuthorized(secret), false);
    assert.equal(isCronAuthorized(`Bearer ${secret}x`), false);
    assert.equal(isCronAuthorized(null), false);
  });

  it("lit la liste d'agents et l'intervalle", () => {
    process.env.BOS_AGENTS_PLANIFIES = "agt-001, agt-005";
    process.env.BOS_AGENTS_INTERVALLE_HEURES = "6";
    assert.deepEqual(getScheduleConfig().agentIds, ["agt-001", "agt-005"]);
    assert.equal(getScheduleConfig().intervalHours, 6);
    process.env.BOS_AGENTS_INTERVALLE_HEURES = "n'importe quoi";
    assert.equal(getScheduleConfig().intervalHours, 20);
  });
});
