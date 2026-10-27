/**
 * Envoi des e-mails approuvés en file HITL, par SMTP (Google Workspace avec un
 * mot de passe d'application, messagerie Hostinger, ou tout autre serveur).
 * BOS_EMAIL_REDIRECTION : en phase de test, tous les envois partent vers cette
 * adresse (le destinataire prévu est indiqué dans l'objet et le texte).
 */
import nodemailer from "nodemailer";

export interface MailConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string | null;
  password: string | null;
  from: string;
  redirection: string | null;
  copie: string | null;
}

function readEnv(name: string) {
  const v = process.env[name]?.trim();
  return v ? v : null;
}

const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export function isEmail(value: string | null | undefined): value is string {
  return Boolean(value && EMAIL.test(value));
}

/** null tant que SMTP_HOST et SMTP_FROM ne sont pas renseignés. */
export function getMailConfig(): MailConfig | null {
  const host = readEnv("SMTP_HOST");
  const from = readEnv("SMTP_FROM");
  if (!host || !from) return null;
  const port = Number(readEnv("SMTP_PORT")) || 587;
  const redirection = readEnv("BOS_EMAIL_REDIRECTION");
  const copie = readEnv("BOS_EMAIL_COPIE");
  return {
    host,
    port,
    secure: readEnv("SMTP_SECURE") ? readEnv("SMTP_SECURE") === "true" : port === 465,
    user: readEnv("SMTP_USER"),
    password: process.env.SMTP_PASSWORD ?? null,
    from,
    redirection: isEmail(redirection) ? redirection : null,
    copie: isEmail(copie) ? copie : null,
  };
}

function transport(config: MailConfig) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user ? { user: config.user, pass: config.password ?? "" } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
}

/** Ce qui part réellement, redirection de test appliquée. */
export function prepareMail(config: MailConfig, mail: OutgoingMail) {
  if (!config.redirection) {
    return { to: mail.to, subject: mail.subject, text: mail.text };
  }
  return {
    to: config.redirection,
    subject: `[TEST → ${mail.to}] ${mail.subject}`,
    text: `(Mode test BOS-IA : cet e-mail était destiné à ${mail.to}.)\n\n${mail.text}`,
  };
}

export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

/**
 * `interne` : message pour l'équipe (alerte, sauvegarde) — ni redirection de
 * test ni copie cachée, qui ne concernent que les e-mails aux clients.
 */
export async function sendMail(
  config: MailConfig,
  mail: OutgoingMail,
  options: { interne?: boolean; attachments?: MailAttachment[] } = {},
) {
  const prepared = options.interne ? { ...mail } : prepareMail(config, mail);
  const info = await transport(config).sendMail({
    from: config.from,
    ...prepared,
    bcc: options.interne ? undefined : (config.copie ?? undefined),
    attachments: options.attachments,
  });
  return { to: prepared.to, messageId: info.messageId as string | undefined };
}

/** Adresse seule de « Nom <adresse> » ou « adresse ». */
export function addressOf(value: string) {
  return (value.match(/<([^<>]+)>/)?.[1] ?? value).trim().toLowerCase();
}

const domainOf = (address: string) => address.split("@")[1] ?? "";

/**
 * Réglages qui passent la vérification mais font échouer ou classer en spam les
 * envois : à corriger avant d'envoyer aux apprenants.
 */
export function mailWarnings(config: MailConfig) {
  const warnings: string[] = [];
  const from = addressOf(config.from);
  if (!isEmail(from)) {
    warnings.push(`SMTP_FROM « ${config.from} » ne contient pas d'adresse valide (ex. Jamaliance <contact@jamaliance.com>)`);
  } else if (config.user && isEmail(config.user) && domainOf(from) !== domainOf(config.user.toLowerCase())) {
    warnings.push(
      `L'expéditeur (${from}) n'est pas sur le domaine du compte SMTP (${config.user}) : la plupart des serveurs refusent ou classent en spam. Utilisez une adresse de ${domainOf(config.user.toLowerCase())}.`,
    );
  }
  if (config.port === 465 && !config.secure) warnings.push("Port 465 avec SMTP_SECURE=false : le port 465 exige SMTP_SECURE=true (ou laissez-le vide)");
  if (config.port === 587 && config.secure) warnings.push("Port 587 avec SMTP_SECURE=true : le port 587 exige SMTP_SECURE=false (ou laissez-le vide)");
  if (config.user && !config.password) warnings.push("SMTP_USER est défini mais SMTP_PASSWORD est vide");
  return warnings;
}

/** Message utile pour une erreur nodemailer, sans jamais citer le mot de passe. */
export function describeMailError(error: unknown, config: MailConfig) {
  const { code, responseCode, response } = error as { code?: string; responseCode?: number; response?: string };
  const google = /gmail|google/i.test(config.host);
  if (code === "EAUTH" || responseCode === 535) {
    return google
      ? "Identifiant ou mot de passe refusé : Google exige un mot de passe d'application (Compte Google → Sécurité → Validation en deux étapes → Mots de passe des applications)"
      : "Identifiant ou mot de passe refusé : SMTP_USER doit être l'adresse e-mail complète et SMTP_PASSWORD le mot de passe de cette boîte";
  }
  const message = String((error as Error).message ?? "");
  if (code === "EDNS" || /ENOTFOUND|EAI_AGAIN/.test(message)) return `Serveur « ${config.host} » introuvable : vérifiez SMTP_HOST`;
  if (code === "ETIMEDOUT" || code === "ECONNECTION" || /ECONNREFUSED|ETIMEDOUT|ECONNRESET/.test(message)) {
    return `Serveur ${config.host}:${config.port} injoignable : vérifiez le port (465 ou 587)`;
  }
  if (/wrong version number|ssl|tls|certificate/i.test(message)) {
    return `Échec du chiffrement sur le port ${config.port} : 465 = SMTP_SECURE=true, 587 = SMTP_SECURE=false`;
  }
  if (responseCode && response) return `Refus du serveur (${responseCode}) : ${response.slice(0, 160)}`;
  return code ? `Connexion SMTP refusée (${code})` : "Connexion SMTP impossible";
}

/** Teste la connexion et l'authentification SMTP (pour /app/integrations). */
export async function verifyMail(config: MailConfig): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await transport(config).verify();
    return { ok: true };
  } catch (error) {
    return { ok: false, message: describeMailError(error, config) };
  }
}
