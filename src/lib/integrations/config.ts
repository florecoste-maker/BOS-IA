/**
 * Connexions externes Jamaliance.
 * Les secrets restent côté serveur ; les URLs publiques peuvent être exposées.
 * Les URLs publiques ont des valeurs par défaut Jamaliance : le moteur
 * fonctionne sur Hostinger sans aucune variable d'environnement à saisir.
 */
import { brand } from "@/lib/brand";

/** Calendrier TidyCal déjà utilisé sur jamaliance.com/reservation. */
export const DEFAULT_TIDYCAL_URL = "https://tidycal.com/m4g6pv9/jamaliance";

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
    (vanityPath ? `https://tidycal.com/${vanityPath}` : DEFAULT_TIDYCAL_URL);
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
    siteUrl: trimOrNull(process.env.NEXT_PUBLIC_JAMALIANCE_SITE_URL) ?? brand.siteUrl,
    appUrl: trimOrNull(process.env.NEXT_PUBLIC_APP_URL) ?? brand.appUrl,
  };
}

export function statusFor(flags: boolean[]): IntegrationStatus {
  if (flags.every(Boolean)) return "configured";
  if (flags.some(Boolean)) return "partial";
  return "missing";
}

function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/**
 * @param servedHost domaine sur lequel le moteur répond réellement (en-tête
 * Host de la requête) : permet de signaler un NEXT_PUBLIC_APP_URL qui ne
 * correspond pas au domaine branché dans Hostinger.
 */
export function getIntegrationsOverview(servedHost?: string | null) {
  const tidycal = getTidyCalServerConfig();
  const hostinger = getHostingerPublicConfig();
  const appHost = hostOf(hostinger.appUrl);
  const isLocal = !servedHost || /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(servedHost);
  const hostMismatch = Boolean(appHost && !isLocal && servedHost !== appHost);

  return {
    agency: "Jamaliance",
    product: "BOS-IA",
    tidycal: {
      // Le lien public suffit pour la prise de rendez-vous (embed) ; l'API est un plus.
      status: tidycal.bookingUrl ? ("configured" as const) : ("missing" as const),
      bookingUrl: tidycal.bookingUrl,
      embedReady: Boolean(tidycal.embedUrl),
      apiReady: tidycal.hasApiAccess,
      bookingTypeReady: Boolean(tidycal.bookingTypeId),
      needsFromUser: [
        !tidycal.bookingUrl
          ? "URL publique TidyCal (NEXT_PUBLIC_TIDYCAL_URL ou NEXT_PUBLIC_TIDYCAL_VANITY_PATH)"
          : null,
      ].filter(Boolean) as string[],
      optional: [
        !tidycal.hasApiAccess
          ? "Jeton API TidyCal (TIDYCAL_API_TOKEN) — plan payant TidyCal requis — pour lire les réservations dans le cockpit"
          : null,
        !tidycal.bookingTypeId
          ? "ID du type de rendez-vous (TIDYCAL_BOOKING_TYPE_ID) pour créer des créneaux via l'API"
          : null,
      ].filter(Boolean) as string[],
    },
    hostinger: {
      status: hostMismatch
        ? ("partial" as const)
        : statusFor([Boolean(hostinger.siteUrl), Boolean(hostinger.appUrl)]),
      siteUrl: hostinger.siteUrl,
      appUrl: hostinger.appUrl,
      servedHost: isLocal ? null : servedHost,
      deployReady: true,
      targetSubdomain: "app.jamaliance.com",
      needsFromUser: [
        !hostinger.siteUrl
          ? "URL du site public Horizons (NEXT_PUBLIC_JAMALIANCE_SITE_URL), ex. https://jamaliance.com"
          : null,
        !hostinger.appUrl
          ? "URL du moteur BOS-IA (NEXT_PUBLIC_APP_URL), prévu : https://app.jamaliance.com"
          : null,
        hostMismatch
          ? `Le moteur répond sur ${servedHost} mais NEXT_PUBLIC_APP_URL vaut ${hostinger.appUrl} : brancher ce domaine dans Hostinger ou corriger la variable, puis redéployer`
          : null,
      ].filter(Boolean) as string[],
    },
  };
}
