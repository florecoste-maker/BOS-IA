/**
 * Export CSV au format exact de l'import : un fichier exporté se réimporte tel
 * quel (restauration). Les liens internes (ids) sont remplacés par les clés
 * lisibles : nom du client, code de mission, numéro de facture.
 */
import type { Client, Invoice, Mission, Payment } from "@/lib/types";
import { FIELDS, type ImportKind, type ImportValue } from "./schema";

export interface ExportData {
  clients: Client[];
  missions: Mission[];
  invoices: Invoice[];
  payments: Payment[];
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
  const clientName = new Map(data.clients.map((c) => [c.id, c.nom]));
  const missionCode = new Map(data.missions.map((m) => [m.id, m.code]));
  const invoiceNumber = new Map(data.invoices.map((i) => [i.id, i.numero]));

  switch (kind) {
    case "clients":
      return data.clients.map((c) => ({
        nom: c.nom,
        contact: c.contact,
        email: c.email,
        telephone: c.telephone,
        secteur: c.secteur,
        statut: c.statut,
        source: c.source,
        notes: c.notes,
      }));
    case "missions":
      return data.missions.map((m) => ({
        code: m.code,
        titre: m.titre,
        client: clientName.get(m.clientId),
        type: m.type,
        statut: m.statut,
        montant: m.montantHT,
        debut: frDate(m.debut),
        fin: frDate(m.fin),
        notes: m.notes,
      }));
    case "factures":
      return data.invoices.map((i) => ({
        numero: i.numero,
        client: clientName.get(i.clientId),
        mission: i.missionId ? missionCode.get(i.missionId) : undefined,
        objet: i.objet,
        montant: i.montantHT,
        tva: i.tauxTva,
        emiseLe: frDate(i.emiseLe),
        echeance: frDate(i.echeance),
        statut: i.status,
        payeeLe: frDate(i.payeeLe),
        recurrence: i.recurrence,
      }));
    case "paiements":
      return data.payments.map((p) => ({
        numero: p.numero,
        facture: invoiceNumber.get(p.factureId),
        montant: p.montant,
        date: frDate(p.date),
        mode: p.mode,
        reference: p.reference,
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
