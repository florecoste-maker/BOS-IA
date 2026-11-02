import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { loadPersistentEnv, writeEnvVariables } from "../env-files";
import { getMailConfig } from "../mail";
import { prepareReglages } from "./reglages";

describe("Réglages du serveur saisis dans le cockpit", () => {
  it("base : traduit les trois valeurs hPanel, hôte laissé au test de connexion", () => {
    const r = prepareReglages({
      section: "base",
      baseNom: " u123_bosia ",
      baseUtilisateur: "u123_bos",
      baseMotDePasse: " mot de passe#1 ",
    });
    assert.deepEqual(r, {
      ok: true,
      section: "base",
      variables: { DB_NAME: "u123_bosia", DB_USER: "u123_bos", DB_PASSWORD: " mot de passe#1 " },
    });
  });

  it("base : refuse un formulaire incomplet ou des noms invalides", () => {
    assert.equal(prepareReglages({ section: "base", baseNom: "b", baseUtilisateur: "u" }).ok, false);
    assert.equal(
      prepareReglages({ section: "base", baseNom: "b; DROP", baseUtilisateur: "u", baseMotDePasse: "p" }).ok,
      false,
    );
    assert.equal(
      prepareReglages({ section: "base", baseNom: "b", baseUtilisateur: "u", baseMotDePasse: "a\nb=c" }).ok,
      false,
    );
  });

  it("e-mails : messagerie Hostinger par défaut, expéditeur construit, mode test", () => {
    const r = prepareReglages({
      section: "emails",
      adresse: "Contact@Jamaliance.com",
      motDePasse: "secret",
      redirection: "moi@jamaliance.com",
    });
    assert.ok(r.ok);
    assert.deepEqual(r.variables, {
      SMTP_HOST: "smtp.hostinger.com",
      SMTP_PORT: "465",
      SMTP_USER: "contact@jamaliance.com",
      SMTP_PASSWORD: "secret",
      SMTP_FROM: "Jamaliance <contact@jamaliance.com>",
      BOS_EMAIL_REDIRECTION: "moi@jamaliance.com",
    });
    const config = getMailConfig({ ...r.variables });
    assert.equal(config?.secure, true);
    assert.equal(config?.redirection, "moi@jamaliance.com");
  });

  it("e-mails : Google en 587, autre serveur vérifié, adresse invalide refusée", () => {
    const google = prepareReglages({ section: "emails", fournisseur: "google", adresse: "a@b.fr", motDePasse: "x" });
    assert.ok(google.ok);
    assert.equal(google.variables.SMTP_PORT, "587");
    assert.equal(google.variables.BOS_EMAIL_REDIRECTION, "");
    assert.equal(
      prepareReglages({ section: "emails", fournisseur: "autre", adresse: "a@b.fr", motDePasse: "x" }).ok,
      false,
    );
    const autre = prepareReglages({
      section: "emails",
      fournisseur: "autre",
      serveur: "smtp.ovh.net",
      port: "587",
      adresse: "a@b.fr",
      motDePasse: "x",
      nomExpediteur: 'Agence <"x">',
    });
    assert.ok(autre.ok);
    assert.equal(autre.variables.SMTP_FROM, "Agence x <a@b.fr>");
    assert.equal(prepareReglages({ section: "emails", adresse: "pas-une-adresse", motDePasse: "x" }).ok, false);
  });

  it("alertes et section inconnue", () => {
    assert.deepEqual(prepareReglages({ section: "alertes", alertes: " Moi@Jamaliance.com " }), {
      ok: true,
      section: "alertes",
      variables: { BOS_ALERTES_EMAIL: "moi@jamaliance.com" },
    });
    assert.equal(prepareReglages({ section: "alertes", alertes: "x" }).ok, false);
    assert.equal(prepareReglages({ section: "BOS_ADMIN_PASSWORD" }).ok, false);
  });
});

describe("Réglage modifié : repris par les autres processus", () => {
  it("une valeur venue de bos-ia.env suit le fichier ; celle du processus reste prioritaire", () => {
    const home = mkdtempSync(path.join(os.tmpdir(), "bos-reglages-"));
    const app = path.join(home, "domains", "bos.exemple.com", "nodejs");
    mkdirSync(app, { recursive: true });
    const file = path.join(home, "bos-ia.env");
    writeFileSync(file, "BOS_TEST_SUIVI=ancienne\nBOS_TEST_PROCESSUS=fichier\n");
    process.env.BOS_TEST_PROCESSUS = "hpanel";
    delete process.env.BOS_TEST_SUIVI;
    try {
      loadPersistentEnv(app);
      assert.equal(process.env.BOS_TEST_SUIVI, "ancienne");
      // Un autre processus réécrit le fichier (formulaire du cockpit).
      writeFileSync(file, "BOS_TEST_SUIVI=nouvelle\nBOS_TEST_PROCESSUS=autre\n");
      loadPersistentEnv(app);
      assert.equal(process.env.BOS_TEST_SUIVI, "nouvelle");
      assert.equal(process.env.BOS_TEST_PROCESSUS, "hpanel");
      // Écriture par ce processus : appliquée et suivie de la même façon.
      writeEnvVariables({ BOS_TEST_SUIVI: "" }, app);
      assert.equal(process.env.BOS_TEST_SUIVI, "");
      assert.match(readFileSync(file, "utf8"), /^BOS_TEST_SUIVI=''$/m);
    } finally {
      delete process.env.BOS_TEST_SUIVI;
      delete process.env.BOS_TEST_PROCESSUS;
    }
  });
});
