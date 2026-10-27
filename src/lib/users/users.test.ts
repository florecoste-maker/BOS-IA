import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { SECOURS } from "../auth";
import { csvCell } from "../audit";
import { getRepository } from "../data";
import { resolveActor } from "../session";
import { hashPassword, passwordProblem, verifyPassword } from "./password";

describe("Mots de passe", () => {
  it("hache avec un sel aléatoire et vérifie", async () => {
    const a = await hashPassword("mot-de-passe-solide");
    const b = await hashPassword("mot-de-passe-solide");
    assert.notEqual(a, b, "sel différent à chaque fois");
    assert.match(a, /^scrypt\$16384\$8\$1\$/);
    assert.equal(await verifyPassword("mot-de-passe-solide", a), true);
    assert.equal(await verifyPassword("mot-de-passe-solidE", a), false);
    // Hash altéré au milieu (le dernier caractère base64url porte des bits de remplissage).
    const parts = a.split("$");
    const h = parts[5];
    const i = Math.floor(h.length / 2);
    parts[5] = `${h.slice(0, i)}${h[i] === "A" ? "B" : "A"}${h.slice(i + 1)}`;
    assert.equal(await verifyPassword("mot-de-passe-solide", parts.join("$")), false);
    assert.equal(await verifyPassword("x", "n'importe quoi"), false);
  });

  it("impose une longueur minimale", () => {
    assert.match(passwordProblem("court")!, /12 caractères/);
    assert.equal(passwordProblem("assez-long-pour-passer"), null);
  });
});

describe("Utilisateur courant", () => {
  afterEach(() => {
    delete process.env.BOS_SECOURS_DESACTIVE;
  });

  it("accepte le compte de secours, sauf s'il est désactivé", async () => {
    assert.deepEqual(await resolveActor(SECOURS), {
      id: "secours",
      nom: "Compte de secours",
      role: "admin",
      secours: true,
    });
    process.env.BOS_SECOURS_DESACTIVE = "1";
    assert.equal(await resolveActor(SECOURS), null);
  });

  it("refuse un compte désactivé et relit le rôle en base", async () => {
    const repo = await getRepository();
    const user = (await repo.createUser({
      email: "Membre@Jamaliance.com",
      nom: "Membre Test",
      role: "membre",
      passwordHash: await hashPassword("mot-de-passe-solide"),
    }))!;
    assert.equal(user.email, "membre@jamaliance.com");
    assert.equal(await repo.createUser({ ...user, passwordHash: "x" }), null, "e-mail unique");

    // Un jeton qui prétend « admin » n'élève pas le rôle : c'est la base qui fait foi.
    const actor = await resolveActor({ uid: user.id, role: "admin", nom: "Membre Test" });
    assert.equal(actor?.role, "membre");

    await repo.updateUser(user.id, { actif: false });
    assert.equal(await resolveActor({ uid: user.id, role: "membre", nom: "Membre Test" }), null);
    assert.equal(await resolveActor({ uid: "usr-inconnu", role: "admin", nom: "X" }), null);
  });
});

describe("Export du journal", () => {
  it("neutralise les formules Excel dans les saisies non fiables", () => {
    assert.equal(csvCell("=HYPERLINK(\"http://x\")"), "\"'=HYPERLINK(\"\"http://x\"\")\"");
    assert.equal(csvCell("+33 6"), "'+33 6");
    assert.equal(csvCell("@SUM(A1)"), "'@SUM(A1)");
    assert.equal(csvCell("camille@exemple.fr"), "camille@exemple.fr");
    assert.equal(csvCell("a;b"), "\"a;b\"");
  });
});
