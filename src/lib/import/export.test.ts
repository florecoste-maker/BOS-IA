import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { store } from "../store";
import { decodeText, parseCsv } from "./csv";
import { exportCsv, type ExportData } from "./export";
import { parseImport } from "./schema";

function data(): ExportData {
  return {
    sessions: store.getSessions(),
    learners: store.getLearners(),
    dossiers: store.getOpcoDossiers(),
    invoices: store.getInvoices(),
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
  it("restitue les sessions à l'identique", () => {
    const d = data();
    const rows = roundTrip("sessions", d);
    assert.equal(rows.length, d.sessions.length);
    d.sessions.forEach((s, i) => {
      assert.equal(rows[i].code, s.code);
      assert.equal(rows[i].titre, s.titre);
      assert.equal(rows[i].debut, s.debut);
      assert.equal(rows[i].fin, s.fin);
      assert.equal(rows[i].places, s.places);
      assert.equal(rows[i].statut, s.statut);
      assert.deepEqual(rows[i].qualiopi, s.qualiopiIndicateurs);
    });
  });

  it("restitue les apprenants avec leur session et leur dernière activité", () => {
    const d = data();
    const rows = roundTrip("apprenants", d);
    d.learners.forEach((l, i) => {
      assert.equal(rows[i].email, l.email.toLowerCase());
      assert.equal(rows[i].statut, l.status);
      assert.equal(rows[i].etape, l.pipelineStage);
      assert.equal(rows[i].session, d.sessions.find((s) => s.id === l.sessionId)?.code ?? null);
      assert.equal(rows[i].derniereActivite, l.derniereActivite);
      assert.equal(rows[i].comprehension, l.comprehensionValidee);
      assert.equal(rows[i].score, l.scoreQuiz ?? null);
    });
  });

  it("restitue dossiers et factures (montants, pièces, paiement, abonnement)", () => {
    const d = data();
    d.dossiers[1] = { ...d.dossiers[1], montant: 1490.5, piecesManquantes: ["Attestation, signée"] };
    const dossiers = roundTrip("dossiers", d);
    assert.equal(dossiers[1].montant, 1490.5);
    assert.deepEqual(dossiers[1].pieces, ["Attestation, signée"], "virgule dans une pièce conservée");
    assert.equal(dossiers[0].apprenant, d.learners.find((l) => l.id === d.dossiers[0].apprenantId)!.email);

    const factures = roundTrip("factures", d);
    d.invoices.forEach((inv, i) => {
      assert.equal(factures[i].numero, inv.numero);
      assert.equal(factures[i].montant, inv.montantHT);
      assert.equal(factures[i].emiseLe, inv.emiseLe);
      assert.equal(factures[i].statut, inv.status);
      assert.equal(factures[i].payeeLe, inv.payeeLe ?? null);
      assert.equal(factures[i].recurrence, inv.recurrence ?? null);
    });
  });

  it("protège les cellules contenant « ; », guillemets et retours à la ligne", () => {
    const d = data();
    d.sessions[0] = { ...d.sessions[0], titre: 'Atelier "IA"; niveau 1\nen ligne' };
    const rows = roundTrip("sessions", d);
    assert.equal(rows[0].titre, 'Atelier "IA"; niveau 1\nen ligne');
  });
});
