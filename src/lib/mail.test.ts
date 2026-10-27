import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addressOf, describeMailError, mailWarnings, verifyMail, type MailConfig } from "./mail";

const base: MailConfig = {
  host: "smtp.hostinger.com",
  port: 465,
  secure: true,
  user: "contact@jamaliance.com",
  password: "secret",
  from: "Jamaliance <contact@jamaliance.com>",
  redirection: null,
  copie: null,
};

describe("Réglages SMTP", () => {
  it("extrait l'adresse de l'expéditeur", () => {
    assert.equal(addressOf("Jamaliance <Contact@Jamaliance.com>"), "contact@jamaliance.com");
    assert.equal(addressOf("contact@jamaliance.com"), "contact@jamaliance.com");
  });

  it("ne signale rien pour une configuration cohérente", () => {
    assert.deepEqual(mailWarnings(base), []);
    assert.deepEqual(mailWarnings({ ...base, host: "smtp.gmail.com", port: 587, secure: false }), []);
  });

  it("signale les erreurs de réglage courantes", () => {
    assert.match(mailWarnings({ ...base, from: "Jamaliance <jamaliance@gmail.com>" })[0], /domaine du compte SMTP/);
    assert.match(mailWarnings({ ...base, from: "Jamaliance" })[0], /adresse valide/);
    assert.match(mailWarnings({ ...base, secure: false })[0], /465/);
    assert.match(mailWarnings({ ...base, port: 587, secure: true })[0], /587/);
    assert.match(mailWarnings({ ...base, password: null })[0], /SMTP_PASSWORD est vide/);
  });

  it("traduit les erreurs du serveur sans citer le mot de passe", () => {
    const auth = describeMailError({ code: "EAUTH", responseCode: 535 }, base);
    assert.match(auth, /adresse e-mail complète/);
    assert.match(describeMailError({ code: "EAUTH" }, { ...base, host: "smtp.gmail.com" }), /mot de passe d'application/);
    assert.match(describeMailError({ code: "EDNS" }, base), /introuvable/);
    assert.match(describeMailError({ code: "ETIMEDOUT" }, base), /injoignable/);
    assert.match(describeMailError(new Error("wrong version number"), base), /SMTP_SECURE/);
    for (const m of [auth, describeMailError({ code: "X" }, base)]) assert.doesNotMatch(m, /secret/);
  });

  it("explique un serveur injoignable", async () => {
    const res = await verifyMail({ ...base, host: "127.0.0.1", port: 1, secure: false });
    assert.equal(res.ok, false);
    if (!res.ok) assert.match(res.message, /injoignable/);
  });
});
