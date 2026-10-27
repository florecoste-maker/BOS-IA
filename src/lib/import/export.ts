/**
 * Export CSV au format exact de l'import : un fichier exporté se réimporte tel
 * quel (restauration). Les liens internes (ids) sont remplacés par les clés
 * lisibles : code de session, e-mail d'apprenant, référence de dossier.
 */
import type { Invoice, Learner, OpcoDossier, TrainingSession } from "@/lib/types";
import { FIELDS, type ImportKind, type ImportValue } from "./schema";

export interface ExportData {
  sessions: TrainingSession[];
  learners: Learner[];
  dossiers: OpcoDossier[];
  invoices: Invoice[];
}

/** AAAA-MM-JJ → JJ/MM/AAAA. */
function frDate(value: string | undefined) {
  if (!value) return "";
  const [y, m, d] = value.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function cell(value: ImportValue | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "oui" : "non";
  if (typeof value === "number") return String(value).replace(".", ",");
  if (Array.isArray(value)) {
    // Une seule valeur contenant « , » ou « ; » : « | » final pour qu'elle ne soit pas découpée.
    const joined = value.join("|");
    return value.length === 1 && /[,;]/.test(value[0]) ? `${joined}|` : joined;
  }
  return value;
}

function quote(value: string) {
  return /[;"\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Lignes (clé de champ → valeur) d'un type, dans l'ordre des données. */
export function exportRecords(kind: ImportKind, data: ExportData): Array<Record<string, ImportValue | undefined>> {
  const sessionCode = new Map(data.sessions.map((s) => [s.id, s.code]));
  const learnerEmail = new Map(data.learners.map((l) => [l.id, l.email]));
  const dossierRef = new Map(data.dossiers.map((d) => [d.id, d.reference]));

  switch (kind) {
    case "sessions":
      return data.sessions.map((s) => ({
        code: s.code,
        titre: s.titre,
        debut: frDate(s.debut),
        fin: frDate(s.fin),
        formateur: s.formateur,
        places: s.places,
        inscrits: s.inscrits,
        statut: s.statut,
        qualiopi: s.qualiopiIndicateurs,
      }));
    case "apprenants":
      return data.learners.map((l) => ({
        email: l.email,
        nom: l.nom,
        prenom: l.prenom,
        entreprise: l.entreprise,
        statut: l.status,
        etape: l.pipelineStage,
        session: l.sessionId ? sessionCode.get(l.sessionId) : undefined,
        derniereActivite: l.derniereActivite,
        comprehension: l.comprehensionValidee,
        score: l.scoreQuiz,
      }));
    case "dossiers":
      return data.dossiers.map((d) => ({
        reference: d.reference,
        organisme: d.organisme,
        apprenant: learnerEmail.get(d.apprenantId),
        session: sessionCode.get(d.sessionId),
        montant: d.montant,
        statut: d.status,
        completude: d.completude,
        pieces: d.piecesManquantes,
      }));
    case "factures":
      return data.invoices.map((i) => ({
        numero: i.numero,
        client: i.client,
        emailClient: i.emailClient,
        montant: i.montantHT,
        emiseLe: frDate(i.emiseLe),
        echeance: frDate(i.echeance),
        statut: i.status,
        acompte: i.acomptePct,
        payeeLe: frDate(i.payeeLe),
        recurrence: i.recurrence,
        dossier: i.dossierOpcoId ? dossierRef.get(i.dossierOpcoId) : undefined,
      }));
  }
}

/** CSV « ; » en UTF-8 avec BOM, ouvrable dans Excel et réimportable. */
export function exportCsv(kind: ImportKind, data: ExportData) {
  const fields = FIELDS[kind];
  const lines = [fields.map((f) => quote(f.header)).join(";")];
  for (const record of exportRecords(kind, data)) {
    lines.push(fields.map((f) => quote(cell(record[f.key]))).join(";"));
  }
  return `﻿${lines.join("\r\n")}\r\n`;
}
