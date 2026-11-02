import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { accessFor, homeFor } from "./access";
import { createSessionToken, landingPath, safeNextPath, verifySessionToken } from "./auth";

const client = { role: "client" as const, clientId: "cli-001" };
const membre = { role: "membre" as const };
const admin = { role: "admin" as const };

describe("Accès par rôle", () => {
  it("enferme un compte client dans son espace", () => {
    assert.deepEqual(accessFor("/espace", client), { kind: "allow" });
    assert.deepEqual(accessFor("/espace/compte", client), { kind: "allow" });
    assert.deepEqual(accessFor("/api/espace", client), { kind: "allow" });
    assert.deepEqual(accessFor("/api/compte", client), { kind: "allow" });
    for (const page of ["/app", "/app/clients", "/app/finance", "/app/utilisateurs"]) {
      assert.deepEqual(accessFor(page, client), { kind: "redirect", to: "/espace" }, page);
    }
    for (const api of ["/api/clients", "/api/finance", "/api/devis", "/api/contacts", "/api/export", "/api/utilisateurs", "/api/agents/run", "/api/espaceX"]) {
      assert.equal(accessFor(api, client).kind, "deny", api);
    }
  });

  it("refuse tout à un compte client sans entreprise", () => {
    assert.equal(accessFor("/espace", { role: "client" }).kind, "deny");
    assert.equal(accessFor("/api/espace", { role: "client" }).kind, "deny");
  });

  it("garde l'équipe dans le cockpit et réserve l'administration", () => {
    assert.deepEqual(accessFor("/app/devis", membre), { kind: "allow" });
    assert.deepEqual(accessFor("/espace", membre), { kind: "redirect", to: "/app" });
    assert.equal(accessFor("/api/espace", admin).kind, "deny");
    assert.deepEqual(accessFor("/app/utilisateurs", membre), { kind: "redirect", to: "/app" });
    assert.equal(accessFor("/api/utilisateurs", membre).kind, "deny");
    assert.deepEqual(accessFor("/api/utilisateurs", admin), { kind: "allow" });
  });

  it("signe et relit la session d'un compte client", () => {
    const saved = { p: process.env.BOS_ADMIN_PASSWORD, s: process.env.BOS_SESSION_SECRET };
    process.env.BOS_ADMIN_PASSWORD = "mot-de-passe-de-test-long";
    process.env.BOS_SESSION_SECRET = "s".repeat(40);
    try {
      const identity = { uid: "usr-1", role: "client" as const, nom: "Client" };
      assert.deepEqual(verifySessionToken(createSessionToken(identity)), identity);
    } finally {
      if (saved.p === undefined) delete process.env.BOS_ADMIN_PASSWORD;
      else process.env.BOS_ADMIN_PASSWORD = saved.p;
      if (saved.s === undefined) delete process.env.BOS_SESSION_SECRET;
      else process.env.BOS_SESSION_SECRET = saved.s;
    }
  });

  it("dirige chacun vers sa zone après connexion", () => {
    assert.equal(homeFor(client), "/espace");
    assert.equal(homeFor(admin), "/app");
    assert.equal(safeNextPath("/espace"), "/espace");
    assert.equal(safeNextPath("/espaces-pirates"), "/app");
    assert.equal(landingPath("client", "/app/finance"), "/espace", "un client ne revient jamais dans le cockpit");
    assert.equal(landingPath("client", "/espace/compte"), "/espace/compte");
    assert.equal(landingPath("membre", "/espace"), "/app");
    assert.equal(landingPath("admin", "/app/devis"), "/app/devis");
  });
});
