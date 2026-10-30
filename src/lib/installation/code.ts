/**
 * Code d'installation à usage unique : ouvre la page /installation tant que
 * BOS_ADMIN_PASSWORD n'existe pas. Rangé dans `bos-ia-installation.txt` à côté
 * de `bos-ia.env` (partagé entre processus Node), supprimé après usage.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { persistentDir } from "@/lib/env-files";

export const INSTALLATION_FILE = "bos-ia-installation.txt";

function file(start?: string) {
  return path.join(persistentDir(start), INSTALLATION_FILE);
}

function readCode(start?: string) {
  try {
    return readFileSync(file(start), "utf8").match(/code=([A-Za-z0-9_-]{20,})/)?.[1] ?? null;
  } catch {
    return null;
  }
}

/** Nouveau code (l'ancien devient invalide). */
export function issueInstallationCode(start?: string) {
  const code = randomBytes(18).toString("base64url");
  writeFileSync(
    file(start),
    [
      "Code d'installation du cockpit BOS-IA (usage unique, ne pas partager).",
      "Ouvrez https://<adresse du cockpit>/installation et saisissez :",
      `code=${code}`,
      "",
    ].join("\n"),
    { mode: 0o600 },
  );
  return code;
}

/** Code existant, créé au besoin (secours : lisible dans le gestionnaire de fichiers Hostinger). */
export function ensureInstallationCode(start?: string) {
  return readCode(start) ?? issueInstallationCode(start);
}

export function checkInstallationCode(candidate: string, start?: string) {
  const code = readCode(start);
  if (!code || !candidate) return false;
  const a = createHash("sha256").update(candidate).digest();
  const b = createHash("sha256").update(code).digest();
  return timingSafeEqual(a, b);
}

export function consumeInstallationCode(start?: string) {
  try {
    unlinkSync(file(start));
  } catch {
    // déjà supprimé
  }
}
