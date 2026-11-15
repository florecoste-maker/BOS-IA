/**
 * Sauvegardes quotidiennes de la base intégrée SQLite, sur l'hébergement.
 *
 * - Emplacement : dossier `sauvegardes` à côté de la base (par défaut
 *   `~/bos-data/sauvegardes/`), hors du dossier de l'application : un redéploiement
 *   ne le touche pas. `BOS_SAUVEGARDES_DIR` permet d'en choisir un autre.
 * - Une copie par jour, `bos-ia-AAAA-MM-JJ.sqlite`, faite par `VACUUM INTO` : copie
 *   cohérente, la base en service n'est jamais modifiée.
 * - Chaque copie est relue (contrôle d'intégrité SQLite + nombre de fiches par table) :
 *   c'est le test de restauration, fait sur la copie, jamais sur la base en service.
 * - Conservation : les 30 dernières copies, plus la première copie de chacun des
 *   12 derniers mois. Seuls les fichiers `bos-ia-AAAA-MM-JJ.sqlite` de ce dossier
 *   peuvent être retirés ; la base elle-même n'est jamais concernée.
 */
import { chmodSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { getDatabaseEngine, getSqlitePath } from "./config";

type Env = Record<string, string | undefined>;

export const COPIES_QUOTIDIENNES = 30;
export const COPIES_MENSUELLES = 12;
/** Au-delà, l'absence de nouvelle copie est signalée par le bilan de santé. */
export const AGE_MAX_HEURES = 36;

/** Tables métier comptées dans chaque copie (contrôle de restauration). */
const TABLES = [
  "bos_clients",
  "bos_contacts",
  "bos_missions",
  "bos_devis",
  "bos_factures",
  "bos_paiements",
  "bos_users",
  "bos_agents",
] as const;

const NOM = /^bos-ia-(\d{4}-\d{2}-\d{2})\.sqlite$/;

export function backupDir(env: Env = process.env): string {
  const choisi = env.BOS_SAUVEGARDES_DIR?.trim();
  return choisi || join(dirname(getSqlitePath(env)), "sauvegardes");
}

export function backupName(date: Date): string {
  return `bos-ia-${date.toISOString().slice(0, 10)}.sqlite`;
}

export interface BackupFile {
  fichier: string;
  /** Jour de la copie (UTC), AAAA-MM-JJ. */
  jour: string;
  octets: number;
  creeLe: string;
}

/** Copies présentes, de la plus ancienne à la plus récente. */
export function listBackups(dir = backupDir()): BackupFile[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map((name) => ({ name, jour: NOM.exec(name)?.[1] }))
    .filter((f): f is { name: string; jour: string } => Boolean(f.jour))
    .map(({ name, jour }) => {
      const st = statSync(join(dir, name));
      return { fichier: join(dir, name), jour, octets: st.size, creeLe: st.mtime.toISOString() };
    })
    .sort((a, b) => a.jour.localeCompare(b.jour));
}

/**
 * Jours à conserver : les `quotidiennes` plus récents, et le plus ancien de chacun
 * des `mensuelles` derniers mois (mois en cours compris).
 */
export function joursAConserver(
  jours: string[],
  now = new Date(),
  quotidiennes = COPIES_QUOTIDIENNES,
  mensuelles = COPIES_MENSUELLES,
): Set<string> {
  const tries = [...new Set(jours)].sort();
  const garder = new Set(tries.slice(-quotidiennes));
  const mois = new Set<string>();
  for (let i = 0; i < mensuelles; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    mois.add(d.toISOString().slice(0, 7));
  }
  const premierDuMois = new Map<string, string>();
  for (const jour of tries) {
    const m = jour.slice(0, 7);
    if (mois.has(m) && !premierDuMois.has(m)) premierDuMois.set(m, jour);
  }
  for (const jour of premierDuMois.values()) garder.add(jour);
  return garder;
}

/** Retire les copies hors conservation ; renvoie les noms retirés. */
export function pruneBackups(dir = backupDir(), now = new Date()): string[] {
  const copies = listBackups(dir);
  const garder = joursAConserver(
    copies.map((c) => c.jour),
    now,
  );
  const retirees: string[] = [];
  for (const copie of copies) {
    if (garder.has(copie.jour)) continue;
    rmSync(copie.fichier, { force: true });
    retirees.push(copie.jour);
  }
  return retirees;
}

/* ---------- vérification (test de restauration) ---------- */

interface ReadonlyDb {
  prepare(sql: string): { all(...p: unknown[]): Array<Record<string, unknown>> };
  close(): void;
}

function openReadonly(file: string): ReadonlyDb {
  const get = (process as unknown as { getBuiltinModule?: (id: string) => unknown }).getBuiltinModule;
  const mod = get?.call(process, "node:sqlite") as
    | { DatabaseSync: new (f: string, o?: { readOnly?: boolean }) => ReadonlyDb }
    | undefined;
  if (!mod?.DatabaseSync) throw new Error(`SQLite indisponible dans Node ${process.versions.node}`);
  return new mod.DatabaseSync(file, { readOnly: true });
}

export interface BackupCheck {
  ok: boolean;
  integrite: string;
  totaux: Record<string, number>;
}

/** Ouvre la copie en lecture seule, contrôle son intégrité et compte les fiches. */
export function verifyBackup(file: string): BackupCheck {
  const db = openReadonly(file);
  try {
    const integrite = String(db.prepare("PRAGMA integrity_check").all()[0]?.integrity_check ?? "inconnue");
    const presentes = new Set(
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => String(r.name)),
    );
    const totaux: Record<string, number> = {};
    for (const table of TABLES) {
      if (!presentes.has(table)) continue;
      totaux[table.replace(/^bos_/, "")] = Number(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).all()[0].n);
    }
    // Une copie valide contient au moins la table des agents (créée au premier démarrage).
    return { ok: integrite === "ok" && presentes.has("bos_agents"), integrite, totaux };
  } finally {
    db.close();
  }
}

/* ---------- sauvegarde du jour ---------- */

export interface BackupResult {
  statut: "creee" | "deja_faite" | "ignoree";
  message: string;
  base?: string;
  dossier?: string;
  fichier?: string;
  octets?: number;
  verification?: BackupCheck;
  copies?: number;
  retirees?: string[];
}

type Snapshot = (target: string) => Promise<void>;

async function defaultSnapshot(target: string) {
  await (await import("./mysql")).sqliteSnapshot(target);
}

const globalForBackup = globalThis as typeof globalThis & { __bosBackup?: Promise<BackupResult> };

/**
 * Fait la copie du jour si elle n'existe pas encore (ou si `force`), la vérifie, puis
 * applique la conservation. Sans base SQLite : rien à faire. Un seul passage à la fois.
 */
export function runDailyBackup(options: { force?: boolean; now?: Date; snapshot?: Snapshot } = {}) {
  const enCours = globalForBackup.__bosBackup;
  if (enCours) return enCours;
  const run = doBackup(options).finally(() => {
    globalForBackup.__bosBackup = undefined;
  });
  globalForBackup.__bosBackup = run;
  return run;
}

async function doBackup({ force = false, now = new Date(), snapshot = defaultSnapshot }: {
  force?: boolean;
  now?: Date;
  snapshot?: Snapshot;
}): Promise<BackupResult> {
  if (getDatabaseEngine() !== "sqlite") {
    return { statut: "ignoree", message: "Sauvegarde de fichier réservée à la base intégrée SQLite" };
  }
  const base = getSqlitePath();
  const dossier = backupDir();
  const fichier = join(dossier, backupName(now));
  mkdirSync(dossier, { recursive: true, mode: 0o700 });

  let statut: BackupResult["statut"] = "deja_faite";
  if (force || !existsSync(fichier)) {
    const temporaire = `${fichier}.en-cours`;
    rmSync(temporaire, { force: true });
    try {
      await snapshot(temporaire);
      const check = verifyBackup(temporaire);
      if (!check.ok) throw new Error(`copie illisible (contrôle d'intégrité : ${check.integrite})`);
      try {
        chmodSync(temporaire, 0o600); // données clients : lisible par le seul compte d'hébergement
      } catch {
        /* système de fichiers sans droits Unix */
      }
      renameSync(temporaire, fichier);
    } finally {
      rmSync(temporaire, { force: true });
    }
    statut = "creee";
  }

  const verification = verifyBackup(fichier);
  const retirees = pruneBackups(dossier, now);
  return {
    statut,
    message: statut === "creee" ? "Copie du jour créée et vérifiée" : "Copie du jour déjà présente, revérifiée",
    base,
    dossier,
    fichier,
    octets: statSync(fichier).size,
    verification,
    copies: listBackups(dossier).length,
    retirees,
  };
}

/** État des sauvegardes pour le bilan de santé (aucune donnée métier). */
export function backupStatus(now = Date.now()) {
  const dossier = backupDir();
  const copies = listBackups(dossier);
  const derniere = copies.at(-1);
  const ageHeures = derniere ? (now - Date.parse(derniere.creeLe)) / 3_600_000 : null;
  return { dossier, nombre: copies.length, derniere, ageHeures };
}
