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

  it("signale Hostinger et TidyCal comme à configurer sans env", () => {
    const overview = getIntegrationsOverview();
    assert.equal(overview.agency, "Jamaliance");
    assert.equal(overview.product, "BOS-IA");
    assert.equal(overview.tidycal.status, "missing");
    assert.equal(overview.hostinger.status, "missing");
    assert.ok(overview.tidycal.needsFromUser.length > 0);
    assert.ok(overview.hostinger.needsFromUser.length > 0);
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
    assert.equal(overview.hostinger.status, "partial");
  });
});
