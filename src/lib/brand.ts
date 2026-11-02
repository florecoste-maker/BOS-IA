/** Identité Jamaliance — BOS-IA est le moteur / cockpit, pas la vitrine. */

export const brand = {
  agency: "Jamaliance",
  product: "BOS-IA",
  tagline: "Moteur opérationnel de l'agence Jamaliance.",
  email: "contact@jamaliance.com",
  /** Site public (Hostinger Horizons) — ne pas le remplacer. */
  siteUrl: "https://jamaliance.com",
  /** Page RDV publique déjà en ligne. */
  reservationUrl: "https://jamaliance.com/reservation",
  /** Adresse retenue pour le cockpit (décision du 2 nov. 2026). */
  appUrl: "https://app.jamaliance.com",
  description:
    "BOS-IA — cockpit opérationnel Jamaliance (formation, finance, agents IA). La vitrine publique reste sur jamaliance.com.",
} as const;

/** Anciennes adresses du cockpit, abandonnées : jamais affichées ni utilisées dans les liens. */
export const RETIRED_APP_HOSTS = ["bos.jamaliance.com"];

/**
 * Adresse du cockpit à afficher et à mettre dans les liens : NEXT_PUBLIC_APP_URL
 * si elle est valide, sauf si elle désigne une ancienne adresse abandonnée
 * (réglage hPanel resté sur bos.jamaliance.com) ; sinon app.jamaliance.com.
 */
export function cockpitBaseUrl(value: string | null | undefined = process.env.NEXT_PUBLIC_APP_URL) {
  const raw = value?.trim();
  if (!raw) return brand.appUrl;
  try {
    const url = new URL(raw);
    if (RETIRED_APP_HOSTS.includes(url.host.toLowerCase())) return brand.appUrl;
    return raw.replace(/\/$/, "");
  } catch {
    return brand.appUrl;
  }
}
