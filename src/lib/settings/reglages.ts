/**
 * Réglages du serveur saisis dans le cockpit (/app/integrations, administrateurs) :
 * base de données, envoi des e-mails et adresse des alertes. Évite de passer
 * par les secrets GitHub ou le gestionnaire de fichiers Hostinger.
 *
 * Ce module ne fait que valider et traduire le formulaire en variables
 * `bos-ia.env` ; la route teste ensuite la connexion avant d'enregistrer.
 */
import { resolveMx } from "node:dns/promises";
import { isEmail } from "@/lib/mail";

export type Section = "base" | "emails" | "alertes" | "ia";

export interface FormulaireReglages {
  section?: unknown;
  /** Base : nom, utilisateur et mot de passe affichés par hPanel → Bases de données. */
  baseNom?: unknown;
  baseUtilisateur?: unknown;
  baseMotDePasse?: unknown;
  baseHote?: unknown;
  /** E-mails : messagerie Hostinger, Google Workspace ou autre serveur. */
  fournisseur?: unknown;
  adresse?: unknown;
  motDePasse?: unknown;
  nomExpediteur?: unknown;
  serveur?: unknown;
  port?: unknown;
  /** Mode test : tous les envois aux clients partent vers cette adresse. */
  redirection?: unknown;
  /** Alertes : adresse qui reçoit rapports, alertes et sauvegardes. */
  alertes?: unknown;
  /** Agents IA : clé API Anthropic (console.anthropic.com → API Keys). */
  cleApi?: unknown;
}

export type Preparation =
  | { ok: true; section: Section; variables: Record<string, string> }
  | { ok: false; erreur: string };

const FOURNISSEURS: Record<string, { host: string; port: string }> = {
  hostinger: { host: "smtp.hostinger.com", port: "465" },
  google: { host: "smtp.gmail.com", port: "587" },
  microsoft: { host: "smtp.office365.com", port: "587" },
};

/**
 * Messagerie d'un domaine d'après ses serveurs MX (« Automatique » dans le
 * formulaire) : évite à l'utilisateur de savoir qui héberge ses e-mails.
 */
export async function detecterFournisseur(
  adresse: string,
  resolve: (domaine: string) => Promise<{ exchange: string }[]> = resolveMx,
): Promise<string | null> {
  const domaine = adresse.split("@")[1]?.toLowerCase();
  if (!domaine) return null;
  try {
    const mx = (await resolve(domaine)).map((r) => r.exchange.toLowerCase()).join(" ");
    if (/hostinger/.test(mx)) return "hostinger";
    if (/google|googlemail/.test(mx)) return "google";
    if (/outlook\.com|office365/.test(mx)) return "microsoft";
  } catch {
    // Domaine sans MX ou DNS indisponible : l'utilisateur choisit à la main.
  }
  return null;
}

const texte = (v: unknown) => (typeof v === "string" ? v.trim() : "");
/** Mot de passe : gardé tel quel (espaces compris), seuls les retours à la ligne sont refusés. */
/** Mot de passe : espaces en bord retirés (un copier-coller sur iPhone en ajoute parfois). */
const secret = (v: unknown) => (typeof v === "string" ? v.trim() : "");
/** Préfixe Hostinger `u123456789_` : l'iPhone met souvent une majuscule au premier caractère. */
const identifiant = (v: unknown) => texte(v).replace(/^U(\d+_)/, "u$1");
const HOTE = /^[A-Za-z0-9.-]+$/;
const NOM_BASE = /^[A-Za-z0-9_$-]{1,64}$/;

export function prepareReglages(form: FormulaireReglages): Preparation {
  const section = form.section;

  if (section === "base") {
    const nom = identifiant(form.baseNom);
    const utilisateur = identifiant(form.baseUtilisateur);
    const motDePasse = secret(form.baseMotDePasse);
    const hote = texte(form.baseHote);
    if (!nom || !utilisateur || !motDePasse) {
      return { ok: false, erreur: "Nom de la base, utilisateur et mot de passe sont nécessaires" };
    }
    if (!NOM_BASE.test(nom)) return { ok: false, erreur: "Nom de la base invalide (ex. u123456789_bosia)" };
    if (!NOM_BASE.test(utilisateur)) return { ok: false, erreur: "Nom d'utilisateur invalide (ex. u123456789_bosia)" };
    if (/[\r\n]/.test(motDePasse)) return { ok: false, erreur: "Le mot de passe ne peut pas contenir de retour à la ligne" };
    if (hote && !HOTE.test(hote)) return { ok: false, erreur: "Serveur de la base invalide (laissez vide en cas de doute)" };
    return {
      ok: true,
      section,
      variables: { DB_NAME: nom, DB_USER: utilisateur, DB_PASSWORD: motDePasse, ...(hote ? { DB_HOST: hote } : {}) },
    };
  }

  if (section === "emails") {
    const fournisseur = texte(form.fournisseur) || "hostinger";
    const adresse = texte(form.adresse).toLowerCase();
    const motDePasse = secret(form.motDePasse);
    const nomExpediteur = texte(form.nomExpediteur).replace(/[<>"\r\n]/g, "") || "Jamaliance";
    const redirection = texte(form.redirection).toLowerCase();
    if (!isEmail(adresse)) return { ok: false, erreur: "Adresse e-mail d'envoi invalide (ex. contact@jamaliance.com)" };
    if (!motDePasse) return { ok: false, erreur: "Mot de passe de la boîte e-mail nécessaire" };
    if (/[\r\n]/.test(motDePasse)) return { ok: false, erreur: "Le mot de passe ne peut pas contenir de retour à la ligne" };
    if (redirection && !isEmail(redirection)) return { ok: false, erreur: "Adresse du mode test invalide" };

    let serveur = FOURNISSEURS[fournisseur];
    if (fournisseur === "autre") {
      const host = texte(form.serveur);
      const port = texte(form.port) || "587";
      if (!host || !HOTE.test(host)) return { ok: false, erreur: "Serveur SMTP invalide (ex. smtp.exemple.com)" };
      if (!/^\d{2,5}$/.test(port)) return { ok: false, erreur: "Port SMTP invalide (465 ou 587)" };
      serveur = { host, port };
    }
    if (!serveur) {
      return {
        ok: false,
        erreur: "Messagerie non reconnue automatiquement : choisissez Hostinger, Google, Microsoft ou « Autre serveur »",
      };
    }

    return {
      ok: true,
      section,
      variables: {
        SMTP_HOST: serveur.host,
        SMTP_PORT: serveur.port,
        SMTP_USER: adresse,
        SMTP_PASSWORD: motDePasse,
        SMTP_FROM: `${nomExpediteur} <${adresse}>`,
        // Vide = envois réels ; une adresse = mode test (tout part vers elle).
        BOS_EMAIL_REDIRECTION: redirection,
      },
    };
  }

  if (section === "ia") {
    // Copier-coller iPhone : espaces et retours à la ligne autour retirés.
    const cle = secret(form.cleApi).replace(/\s+/g, "");
    if (!cle) return { ok: false, erreur: "Collez la clé API Anthropic" };
    if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(cle)) {
      return { ok: false, erreur: "Ce n'est pas une clé API Anthropic : elle commence par sk-ant-api03-" };
    }
    return { ok: true, section, variables: { BOS_ANTHROPIC_API_KEY: cle } };
  }

  if (section === "alertes") {
    const adresse = texte(form.alertes).toLowerCase();
    if (!isEmail(adresse)) return { ok: false, erreur: "Adresse e-mail invalide" };
    return { ok: true, section, variables: { BOS_ALERTES_EMAIL: adresse } };
  }

  return { ok: false, erreur: "Section inconnue : base, emails ou alertes" };
}
