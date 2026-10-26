/**
 * Connexions externes Jamaliance.
 * Les secrets restent côté serveur ; les URLs publiques peuvent être exposées.
 */

export type IntegrationStatus = "configured" | "partial" | "missing";

export interface TidyCalPublicConfig {
  bookingUrl: string | null;
  embedUrl: string | null;
  vanityPath: string | null;
}

export interface TidyCalServerConfig extends TidyCalPublicConfig {
  apiToken: string | null;
  bookingTypeId: string | null;
  hasApiAccess: boolean;
}

export interface HostingerPublicConfig {
  siteUrl: string | null;
  appUrl: string | null;
}

function trimOrNull(value: string | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

function tidyCalUrlsFromEnv(): Pick<
  TidyCalPublicConfig,
  "bookingUrl" | "embedUrl" | "vanityPath"
> {
  const bookingUrl = trimOrNull(process.env.NEXT_PUBLIC_TIDYCAL_URL);
  const vanityPath = trimOrNull(process.env.NEXT_PUBLIC_TIDYCAL_VANITY_PATH);
  const derivedBooking =
    bookingUrl ??
    (vanityPath ? `https://tidycal.com/${vanityPath}` : null);
  const embedUrl =
    trimOrNull(process.env.NEXT_PUBLIC_TIDYCAL_EMBED_URL) ??
    (derivedBooking ? `${derivedBooking}?embed=1` : null);

  return {
    bookingUrl: derivedBooking,
    embedUrl,
    vanityPath,
  };
}

export function getTidyCalPublicConfig(): TidyCalPublicConfig {
  return tidyCalUrlsFromEnv();
}

export function getTidyCalServerConfig(): TidyCalServerConfig {
  const publicConfig = tidyCalUrlsFromEnv();
  const apiToken = trimOrNull(process.env.TIDYCAL_API_TOKEN);
  const bookingTypeId = trimOrNull(process.env.TIDYCAL_BOOKING_TYPE_ID);

  return {
    ...publicConfig,
    apiToken,
    bookingTypeId,
    hasApiAccess: Boolean(apiToken),
  };
}

export function getHostingerPublicConfig(): HostingerPublicConfig {
  return {
    siteUrl: trimOrNull(process.env.NEXT_PUBLIC_JAMALIANCE_SITE_URL),
    appUrl: trimOrNull(process.env.NEXT_PUBLIC_APP_URL),
  };
}

export function statusFor(flags: boolean[]): IntegrationStatus {
  if (flags.every(Boolean)) return "configured";
  if (flags.some(Boolean)) return "partial";
  return "missing";
}

export function getIntegrationsOverview() {
  const tidycal = getTidyCalServerConfig();
  const hostinger = getHostingerPublicConfig();

  return {
    agency: "Jamaliance",
    product: "BOS-IA",
    tidycal: {
      status: statusFor([
        Boolean(tidycal.bookingUrl),
        tidycal.hasApiAccess,
      ]),
      bookingUrl: tidycal.bookingUrl,
      embedReady: Boolean(tidycal.embedUrl),
      apiReady: tidycal.hasApiAccess,
      bookingTypeReady: Boolean(tidycal.bookingTypeId),
      needsFromUser: [
        !tidycal.bookingUrl
          ? "URL publique TidyCal (NEXT_PUBLIC_TIDYCAL_URL ou NEXT_PUBLIC_TIDYCAL_VANITY_PATH)"
          : null,
        !tidycal.hasApiAccess
          ? "Jeton API TidyCal (TIDYCAL_API_TOKEN) — plan payant TidyCal requis"
          : null,
        !tidycal.bookingTypeId
          ? "ID du type de rendez-vous (TIDYCAL_BOOKING_TYPE_ID) pour créer des créneaux via l'API"
          : null,
      ].filter(Boolean) as string[],
    },
    hostinger: {
      status: statusFor([
        Boolean(hostinger.siteUrl),
        Boolean(hostinger.appUrl),
      ]),
      siteUrl: hostinger.siteUrl,
      appUrl: hostinger.appUrl,
      deployReady: true,
      targetSubdomain: "app.jamaliance.com",
      needsFromUser: [
        !hostinger.siteUrl
          ? "URL du site public Horizons (NEXT_PUBLIC_JAMALIANCE_SITE_URL), ex. https://jamaliance.com"
          : null,
        !hostinger.appUrl
          ? "URL du moteur BOS-IA (NEXT_PUBLIC_APP_URL), prévu : https://app.jamaliance.com"
          : null,
        "Web App Node.js Hostinger sur le sous-domaine app.jamaliance.com (sans toucher à la vitrine Horizons)",
        "Variables d'environnement dans hPanel (voir .env.example)",
      ].filter(Boolean) as string[],
    },
  };
}
