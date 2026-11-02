import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { zipSync } from "fflate";
import { decodeText, detectDelimiter, parseCsv } from "./csv";
import {
  parseDate,
  parseDateTime,
  parseDecimal,
  parseImport,
  templateCsv,
} from "./schema";
import { XlsxError, readXlsx } from "./xlsx";

const fixture = (name: string) =>
  new Uint8Array(readFileSync(path.join(import.meta.dirname, "fixtures", name)));

describe("Lecture CSV", () => {
  it("lit un CSV Excel français (Windows-1252, « ; », guillemets)", () => {
    const rows = parseCsv(decodeText(fixture("clients-excel-fr.csv")));
    assert.equal(rows[0][0], "Société");
    assert.equal(rows[0][3], "Téléphone");
    assert.equal(rows[1][0], "Atelier; Fils");
    assert.equal(rows[2][0], "Océan Services");
  });

  it("décode les caractères spéciaux de Windows-1252 (€, ’, «, œ, …)", () => {
    // Octets produits par Excel en français (Python : texte.encode("cp1252")).
    const bytes = new Uint8Array([77, 111, 110, 116, 97, 110, 116, 59, 78, 111, 116, 101, 13, 10, 49, 32, 52, 57, 48, 44, 48, 48, 32, 128, 59, 108, 146, 233, 113, 117, 105, 112, 101, 32, 150, 32, 171, 32, 156, 117, 118, 114, 101, 32, 187, 32, 133, 13, 10]);
    const rows = parseCsv(decodeText(bytes));
    assert.deepEqual(rows[1], ["1 490,00 €", "l’équipe – « œuvre » …"]);
    assert.equal(parseDecimal(rows[1][0]), 1490);
  });

  it("retire le BOM UTF-8 et détecte la virgule", () => {
    const text = decodeText(new TextEncoder().encode('﻿a,b\n"x ""y""",2\n'));
    assert.equal(detectDelimiter(text), ",");
    assert.deepEqual(parseCsv(text), [["a", "b"], ['x "y"', "2"]]);
  });

  it("garde les retours à la ligne entre guillemets", () => {
    assert.deepEqual(parseCsv('a;b\r\n"1\n2";3'), [["a", "b"], ["1\n2", "3"]]);
  });
});

describe("Lecture Excel", () => {
  it("lit la première feuille d'un classeur openpyxl (dates en série)", () => {
    const rows = readXlsx(fixture("missions-openpyxl.xlsx"));
    assert.equal(rows[0][6], "Date de début");
    assert.equal(rows[1][1], "Agent IA — réponses aux devis");
    assert.equal(parseDate(rows[1][6]), "2026-11-03");
    assert.equal(rows[2][7], "");
  });

  it("lit un classeur LibreOffice (chaînes partagées)", () => {
    const rows = readXlsx(fixture("clients-libreoffice.xlsx"));
    assert.equal(rows[0][3], "Téléphone");
    assert.equal(rows[1][0], "Atelier; Fils");
    assert.equal(rows[2][3], "692123456");
  });

  it("refuse un fichier qui n'est pas un .xlsx", () => {
    assert.throws(() => readXlsx(fixture("clients-excel-fr.csv")), XlsxError);
    assert.throws(() => readXlsx(zipSync({ "autre.txt": new Uint8Array([1]) })), XlsxError);
  });
});

describe("Conversion des valeurs", () => {
  it("lit les dates françaises, ISO et Excel", () => {
    assert.equal(parseDate("03/11/2026"), "2026-11-03");
    assert.equal(parseDate("3.11.2026"), "2026-11-03");
    assert.equal(parseDate("2026-11-03"), "2026-11-03");
    assert.equal(parseDate("46329"), "2026-11-03");
    assert.equal(parseDate("31/02/2026"), null);
    assert.equal(parseDate("demain"), null);
    assert.equal(parseDateTime("27/10/2026 14h30"), "2026-10-27T14:30:00.000Z");
  });

  it("lit les montants français", () => {
    assert.equal(parseDecimal("1 490,50 €"), 1490.5);
    assert.equal(parseDecimal("1490.5"), 1490.5);
    assert.equal(parseDecimal("1,490.50"), 1490.5);
    assert.equal(parseDecimal("1.490,50"), 1490.5);
    assert.equal(parseDecimal("abc"), null);
  });
});

describe("Validation d'un import", () => {
  it("reconnaît les en-têtes et libellés français d'un vrai fichier", () => {
    const table = parseCsv(decodeText(fixture("clients-excel-fr.csv")));
    const { rows, errors, warnings } = parseImport("clients", table);
    assert.deepEqual(errors, []);
    assert.deepEqual(warnings, []);
    assert.equal(rows[0].record.nom, "Atelier; Fils");
    assert.equal(rows[0].record.email, "camille.dupont@exemple.fr");
    assert.equal(rows[0].record.statut, "actif");
    assert.equal(rows[0].record.telephone, "01 23 45 67 89");
    assert.equal(rows[1].record.statut, "prospect");
    assert.equal(rows[1].record.telephone, null);
    assert.equal(rows[1].line, 3);
  });

  it("lit un classeur LibreOffice de clients", () => {
    const { rows, errors } = parseImport("clients", readXlsx(fixture("clients-libreoffice.xlsx")));
    assert.deepEqual(errors, []);
    assert.equal(rows[1].record.telephone, "692123456");
    assert.equal(rows[1].record.notes, "Rappeler en janvier");
  });

  it("convertit dates, montants et types d'un classeur Excel de missions", () => {
    const { rows, errors } = parseImport("missions", readXlsx(fixture("missions-openpyxl.xlsx")));
    assert.deepEqual(errors, []);
    assert.equal(rows[0].record.debut, "2026-11-03");
    assert.equal(rows[0].record.fin, "2026-12-15");
    assert.equal(rows[0].record.type, "agent_ia");
    assert.equal(rows[0].record.statut, "signee");
    assert.equal(rows[0].record.montant, 4800);
    assert.equal(rows[1].record.type, "automatisation");
    assert.equal(rows[1].record.statut, "en_cours");
    assert.equal(rows[1].record.montant, 3200.5);
    assert.equal(rows[1].record.fin, null);
  });

  it("signale les erreurs par ligne et les doublons", () => {
    const { rows, errors } = parseImport("factures", [
      ["numero", "client", "montant_ht", "emise_le", "echeance", "statut", "colonne inconnue"],
      ["FA-1", "Atelier", "1490", "01/10/2026", "31/10/2026", "Payée", "x"],
      ["FA-2", "", "abc", "32/10/2026", "31/10/2026", "Envolée", ""],
      ["fa-1", "Autre", "10", "01/10/2026", "31/10/2026", "", ""],
      ["", "", "", "", "", "", ""],
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].record.statut, "payee");
    assert.equal(errors.length, 2);
    assert.equal(errors[0].line, 3);
    assert.match(errors[0].message, /client.*obligatoire/);
    assert.match(errors[0].message, /montant invalide/);
    assert.match(errors[0].message, /date invalide/);
    assert.match(errors[0].message, /Envolée.*inconnue/);
    assert.equal(errors[1].line, 4);
    assert.match(errors[1].message, /déjà ligne 2/);
  });

  it("lit TVA, date de solde et récurrence des factures", () => {
    const { rows, errors } = parseImport("factures", [
      ["N° facture", "Client", "Total HT", "TVA", "Date facture", "Échéance", "Date de paiement", "Abonnement"],
      ["FA-9", "Atelier", "1490", "5,5 %", "01/10/2026", "31/10/2026", "15/10/2026", "Trimestriel"],
      ["FA-10", "Atelier", "10", "", "01/10/2026", "31/10/2026", "", "hebdo"],
      ["FA-11", "Atelier", "10", "120", "01/10/2026", "31/10/2026", "", ""],
    ]);
    assert.equal(rows[0].record.tva, 5.5);
    assert.equal(rows[0].record.payeeLe, "2026-10-15");
    assert.equal(rows[0].record.recurrence, "trimestriel");
    assert.equal(errors.length, 2);
    assert.match(errors[0].message, /hebdo.*inconnue/);
    assert.match(errors[1].message, /taux de 0 à 100/);
  });

  it("reconnaît les modes de paiement en toutes lettres", () => {
    const { rows, errors } = parseImport("paiements", [
      ["N° règlement", "Facture", "Montant reçu", "Date de paiement", "Moyen de paiement"],
      ["REG-1", "FA-1", "1 728,00 €", "20/10/2026", "Carte bancaire"],
      ["REG-2", "FA-1", "10", "21/10/2026", "Bitcoin"],
    ]);
    assert.equal(rows[0].record.mode, "carte");
    assert.equal(rows[0].record.montant, 1728);
    assert.match(errors[0].message, /Bitcoin.*inconnue/);
  });

  it("refuse un fichier sans les colonnes obligatoires", () => {
    const { errors } = parseImport("missions", [["code", "statut"], ["M1", "En cours"]]);
    assert.match(errors[0].message, /titre, client/);
  });

  it("produit des modèles qui se relisent sans erreur", () => {
    for (const kind of ["clients", "missions", "factures", "paiements"] as const) {
      const { rows, errors } = parseImport(kind, parseCsv(decodeText(new TextEncoder().encode(templateCsv(kind)))));
      assert.deepEqual(errors, [], kind);
      assert.equal(rows.length, 1, kind);
    }
  });
});
