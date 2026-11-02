import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import {
  getHostingerPublicConfig,
  getIntegrationsOverview,
  getTidyCalPublicConfig,
  statusFor,
} from "./config";

const KEYS = [
  "NEXT_PUBLIC_TIDYCAL_URL",
  "NEXT_PUBLIC_TIDYCAL_VANITY_PATH",
  "NEXT_PUBLIC_TIDYCAL_EMBED_URL",
  "TIDYCAL_API_TOKEN",
  "TIDYCAL_BOOKING_TYPE_ID",
  "NEXT_PUBLIC_JAMALIANCE_SITE_URL",
  "NEXT_PUBLIC_APP_URL",
] as const;

describe("Jamaliance integrations config", () => {
  const backup: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of KEYS) {
      backup[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of KEYS) {
      if (backup[key] === undefined) delete process.env[key];
      else process.env[key] = backup[key];
    }
  });

  it("statusFor distingue missing / partial / configured", () => {
    assert.equal(statusFor([false, false]), "missing");
    assert.equal(statusFor([true, false]), "partial");
    assert.equal(statusFor([true, true]), "configured");
  });

  it("dérive l'URL TidyCal depuis le vanity path", () => {
    process.env.NEXT_PUBLIC_TIDYCAL_VANITY_PATH = "jamaliance";
    const cfg = getTidyCalPublicConfig();
    assert.equal(cfg.bookingUrl, "https://tidycal.com/jamaliance");
    assert.equal(cfg.embedUrl, "https://tidycal.com/jamaliance?embed=1");
  });

  it("utilise les valeurs Jamaliance par défaut sans env", () => {
    const overview = getIntegrationsOverview();
    assert.equal(overview.agency, "Jamaliance");
    assert.equal(overview.product, "BOS-IA");
    assert.equal(overview.tidycal.status, "configured");
    assert.equal(overview.tidycal.bookingUrl, "https://tidycal.com/m4g6pv9/jamaliance");
    assert.equal(overview.hostinger.status, "configured");
    assert.equal(overview.hostinger.siteUrl, "https://jamaliance.com");
    assert.equal(overview.hostinger.appUrl, "https://app.jamaliance.com");
    assert.deepEqual(overview.tidycal.needsFromUser, []);
    assert.deepEqual(overview.hostinger.needsFromUser, []);
  });

  it("lit le site Hostinger public", () => {
    process.env.NEXT_PUBLIC_JAMALIANCE_SITE_URL = "https://jamaliance.com";
    assert.equal(
      getHostingerPublicConfig().siteUrl,
      "https://jamaliance.com",
    );
  });

  it("cible le sous-domaine app.jamaliance.com pour le moteur", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.jamaliance.com";
    const overview = getIntegrationsOverview();
    assert.equal(overview.hostinger.appUrl, "https://app.jamaliance.com");
    assert.equal(overview.hostinger.targetSubdomain, "app.jamaliance.com");
    assert.equal(overview.hostinger.status, "configured");
  });

  it("passe Hostinger et TidyCal en connecté une fois les URLs renseignées", () => {
    process.env.NEXT_PUBLIC_JAMALIANCE_SITE_URL = "https://jamaliance.com";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.jamaliance.com";
    process.env.NEXT_PUBLIC_TIDYCAL_URL = "https://tidycal.com/m4g6pv9/jamaliance";
    const overview = getIntegrationsOverview("app.jamaliance.com");
    assert.equal(overview.hostinger.status, "configured");
    assert.deepEqual(overview.hostinger.needsFromUser, []);
    assert.equal(overview.tidycal.status, "configured");
    assert.deepEqual(overview.tidycal.needsFromUser, []);
    assert.ok(overview.tidycal.optional.length > 0);
  });

  it("signale un domaine servi différent de NEXT_PUBLIC_APP_URL", () => {
    process.env.NEXT_PUBLIC_JAMALIANCE_SITE_URL = "https://jamaliance.com";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.jamaliance.com";
    const overview = getIntegrationsOverview("autre.jamaliance.com");
    assert.equal(overview.hostinger.status, "partial");
    assert.equal(overview.hostinger.servedHost, "autre.jamaliance.com");
    assert.match(overview.hostinger.needsFromUser[0], /autre\.jamaliance\.com/);
  });

  it("ignore localhost pour la comparaison de domaine", () => {
    process.env.NEXT_PUBLIC_JAMALIANCE_SITE_URL = "https://jamaliance.com";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.jamaliance.com";
    const overview = getIntegrationsOverview("localhost:3000");
    assert.equal(overview.hostinger.status, "configured");
    assert.equal(overview.hostinger.servedHost, null);
  });
});

describe("Adresse du cockpit affichée", () => {
  it("l'ancienne adresse bos.jamaliance.com est remplacée par app.jamaliance.com", async () => {
    const { cockpitBaseUrl } = await import("../brand");
    assert.equal(cockpitBaseUrl("https://bos.jamaliance.com"), "https://app.jamaliance.com");
    assert.equal(cockpitBaseUrl("https://bos.jamaliance.com/"), "https://app.jamaliance.com");
    assert.equal(cockpitBaseUrl(""), "https://app.jamaliance.com");
    assert.equal(cockpitBaseUrl("pas une url"), "https://app.jamaliance.com");
    assert.equal(cockpitBaseUrl("https://app.jamaliance.com/"), "https://app.jamaliance.com");
    assert.equal(cockpitBaseUrl("https://autre.exemple.fr"), "https://autre.exemple.fr");
  });

  it("carte Hostinger : app.jamaliance.com, sans alerte de domaine, même si le réglage dit bos", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://bos.jamaliance.com";
    const overview = getIntegrationsOverview("app.jamaliance.com");
    assert.equal(overview.hostinger.appUrl, "https://app.jamaliance.com");
    assert.deepEqual(overview.hostinger.needsFromUser, []);
    delete process.env.NEXT_PUBLIC_APP_URL;
  });
});

describe("Ancienne adresse bos.jamaliance.com", () => {
  it("est redirigée vers app.jamaliance.com, et seulement elle", async () => {
    const config = (await import("../../../next.config.mjs")).default;
    const regles = await config.redirects!();
    assert.equal(regles.length, 2);
    for (const r of regles) {
      assert.equal(r.permanent, false);
      assert.ok(r.destination.startsWith("https://app.jamaliance.com/"));
      assert.deepEqual(r.has, [{ type: "host", value: "bos\\.jamaliance\\.com" }]);
    }
    assert.equal(regles.find((r) => r.source === "/")?.destination, "https://app.jamaliance.com/app");
  });
});
