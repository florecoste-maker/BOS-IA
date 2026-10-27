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
    const rows = parseCsv(decodeText(fixture("apprenants-excel-fr.csv")));
    assert.equal(rows[0][2], "Prénom");
    assert.equal(rows[1][3], "Atelier; Fils");
    assert.equal(rows[2][3], "Océan Services");
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
    const rows = readXlsx(fixture("sessions-openpyxl.xlsx"));
    assert.equal(rows[0][2], "Date de début");
    assert.equal(rows[1][1], "Google Workspace — Prise en main");
    assert.equal(parseDate(rows[1][2]), "2026-11-03");
    assert.equal(rows[2][6], "");
  });

  it("lit un classeur LibreOffice (chaînes partagées)", () => {
    const rows = readXlsx(fixture("apprenants-libreoffice.xlsx"));
    assert.equal(rows[0][2], "Prénom");
    assert.equal(rows[1][3], "Atelier; Fils");
    assert.equal(rows[2][7], "82");
  });

  it("refuse un fichier qui n'est pas un .xlsx", () => {
    assert.throws(() => readXlsx(fixture("apprenants-excel-fr.csv")), XlsxError);
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
    const table = parseCsv(decodeText(fixture("apprenants-excel-fr.csv")));
    const { rows, errors, warnings } = parseImport("apprenants", table);
    assert.deepEqual(errors, []);
    assert.deepEqual(warnings, []);
    assert.equal(rows[0].record.email, "camille.dupont@exemple.fr");
    assert.equal(rows[0].record.entreprise, "Atelier; Fils");
    assert.equal(rows[0].record.statut, "en_formation");
    assert.equal(rows[0].record.comprehension, false);
    assert.equal(rows[1].record.statut, "inactif");
    assert.equal(rows[1].record.score, 82);
    assert.equal(rows[1].line, 3);
  });

  it("convertit dates et listes d'un classeur Excel", () => {
    const { rows, errors } = parseImport("sessions", readXlsx(fixture("sessions-openpyxl.xlsx")));
    assert.deepEqual(errors, []);
    assert.equal(rows[0].record.debut, "2026-11-03");
    assert.deepEqual(rows[0].record.qualiopi, ["I4", "I11"]);
    assert.deepEqual(rows[1].record.qualiopi, ["I4", "I26"]);
    assert.equal(rows[1].record.statut, "en_cours");
    assert.equal(rows[1].record.inscrits, null);
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

  it("lit la date de paiement et la récurrence des factures", () => {
    const { rows, errors } = parseImport("factures", [
      ["N° facture", "Client", "Total HT", "Date facture", "Échéance", "Date de paiement", "Abonnement"],
      ["FA-9", "Atelier", "1490", "01/10/2026", "31/10/2026", "15/10/2026", "Trimestriel"],
      ["FA-10", "Atelier", "10", "01/10/2026", "31/10/2026", "", "hebdo"],
    ]);
    assert.equal(rows[0].record.payeeLe, "2026-10-15");
    assert.equal(rows[0].record.recurrence, "trimestriel");
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /hebdo.*inconnue/);
  });

  it("refuse un fichier sans les colonnes obligatoires", () => {
    const { errors } = parseImport("dossiers", [["reference", "organisme"], ["R1", "AKTO"]]);
    assert.match(errors[0].message, /apprenant_email, session_code, montant/);
  });

  it("produit des modèles qui se relisent sans erreur", () => {
    for (const kind of ["sessions", "apprenants", "dossiers", "factures"] as const) {
      const { rows, errors } = parseImport(kind, parseCsv(decodeText(new TextEncoder().encode(templateCsv(kind)))));
      assert.deepEqual(errors, [], kind);
      assert.equal(rows.length, 1, kind);
    }
  });
});
