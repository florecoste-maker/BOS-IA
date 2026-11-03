import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { store } from "../store";
import { decodeText, parseCsv } from "./csv";
import { exportCsv, type ExportData } from "./export";
import { parseImport } from "./schema";

function data(): ExportData {
  return {
    clients: store.getClients(),
    missions: store.getMissions(),
    invoices: store.getInvoices(),
    payments: store.getPayments(),
  };
}

function roundTrip(kind: Parameters<typeof exportCsv>[0], input: ExportData) {
  const csv = exportCsv(kind, input);
  const parsed = parseImport(kind, parseCsv(decodeText(new TextEncoder().encode(csv))));
  assert.deepEqual(parsed.errors, [], kind);
  assert.deepEqual(parsed.warnings, [], kind);
  return parsed.rows.map((r) => r.record);
}

describe("Export CSV réimportable (restauration)", () => {
  it("restitue les clients à l'identique", () => {
    const d = data();
    const rows = roundTrip("clients", d);
    assert.equal(rows.length, d.clients.length);
    d.clients.forEach((c, i) => {
      assert.equal(rows[i].nom, c.nom);
      assert.equal(rows[i].contact, c.contact ?? null);
      assert.equal(rows[i].email, c.email ?? null);
      assert.equal(rows[i].telephone, c.telephone ?? null);
      assert.equal(rows[i].statut, c.statut);
      assert.equal(rows[i].source, c.source ?? null);
      assert.equal(rows[i].notes, c.notes ?? null);
    });
  });

  it("restitue les missions avec leur client, leurs dates et leur montant", () => {
    const d = data();
    d.missions[0] = { ...d.missions[0], montantHT: 4800.5 };
    const rows = roundTrip("missions", d);
    d.missions.forEach((m, i) => {
      assert.equal(rows[i].code, m.code);
      assert.equal(rows[i].client, d.clients.find((c) => c.id === m.clientId)!.nom);
      assert.equal(rows[i].type, m.type);
      assert.equal(rows[i].statut, m.statut);
      assert.equal(rows[i].montant, m.montantHT);
      assert.equal(rows[i].debut, m.debut ?? null);
      assert.equal(rows[i].fin, m.fin ?? null);
    });
  });

  it("restitue factures (TVA, mission, solde, abonnement) et paiements", () => {
    const d = data();
    const factures = roundTrip("factures", d);
    d.invoices.forEach((inv, i) => {
      assert.equal(factures[i].numero, inv.numero);
      assert.equal(factures[i].client, inv.client);
      assert.equal(factures[i].mission, d.missions.find((m) => m.id === inv.missionId)?.code ?? null);
      assert.equal(factures[i].montant, inv.montantHT);
      assert.equal(factures[i].tva, inv.tauxTva);
      assert.equal(factures[i].emiseLe, inv.emiseLe);
      assert.equal(factures[i].statut, inv.status);
      assert.equal(factures[i].payeeLe, inv.payeeLe ?? null);
      assert.equal(factures[i].recurrence, inv.recurrence ?? null);
    });

    const paiements = roundTrip("paiements", d);
    d.payments.forEach((p, i) => {
      assert.equal(paiements[i].numero, p.numero);
      assert.equal(paiements[i].facture, d.invoices.find((inv) => inv.id === p.factureId)!.numero);
      assert.equal(paiements[i].montant, p.montant);
      assert.equal(paiements[i].date, p.date);
      assert.equal(paiements[i].mode, p.mode);
    });
  });

  it("protège les cellules contenant « ; », guillemets et retours à la ligne", () => {
    const d = data();
    d.clients[0] = { ...d.clients[0], nom: 'Atelier "Nord"; SARL', notes: "Ligne 1\nLigne 2 ; fin" };
    const rows = roundTrip("clients", d);
    assert.equal(rows[0].nom, 'Atelier "Nord"; SARL');
    assert.equal(rows[0].notes, "Ligne 1\nLigne 2 ; fin");
  });
});
