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

export async function sendMail(config: MailConfig, mail: OutgoingMail) {
  const prepared = prepareMail(config, mail);
  const info = await transport(config).sendMail({
    from: config.from,
    ...prepared,
    bcc: config.copie ?? undefined,
  });
  return { to: prepared.to, messageId: info.messageId as string | undefined };
}

/** Teste la connexion et l'authentification SMTP (pour /app/integrations). */
export async function verifyMail(config: MailConfig): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await transport(config).verify();
    return { ok: true };
  } catch (error) {
    const code = (error as { code?: string; responseCode?: number }).code;
    return { ok: false, message: code ? `Connexion SMTP refusée (${code})` : "Connexion SMTP impossible" };
  }
}
