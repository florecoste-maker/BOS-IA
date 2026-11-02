import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeMetrics, monthlyRecurringRevenue, paymentDelay } from "./metrics";
import type { Invoice } from "./types";

const NOW = Date.parse("2026-10-27T10:00:00Z");

function invoice(partial: Partial<Invoice>): Invoice {
  return {
    id: "i",
    numero: "FA",
    clientId: "c",
    client: "C",
    montantHT: 100,
    tauxTva: 20,
    montantTTC: 120,
    montantPaye: 0,
    resteDu: 120,
    status: "emise",
    emiseLe: "2026-10-01",
    echeance: "2026-10-31",
    joursRetard: 0,
    ...partial,
  };
}

describe("Délai de paiement moyen", () => {
  it("vaut null sans facture payée datée", () => {
    assert.deepEqual(paymentDelay([invoice({ status: "payee" })], NOW), { moyenne: null, base: 0 });
  });

  it("fait la moyenne en jours sur les 12 derniers mois", () => {
    const result = paymentDelay(
      [
        invoice({ emiseLe: "2026-09-01", payeeLe: "2026-09-21" }), // 20 j
        invoice({ emiseLe: "2026-10-01", payeeLe: "2026-10-11" }), // 10 j
        invoice({ emiseLe: "2026-10-10", payeeLe: "2026-10-25" }), // 15 j
        invoice({ emiseLe: "2025-01-01", payeeLe: "2025-03-01" }), // hors période
        invoice({ emiseLe: "2026-10-20", payeeLe: "2026-10-15" }), // payée avant émission : 0 j
      ],
      NOW,
    );
    assert.deepEqual(result, { moyenne: 11, base: 4 });
  });
});

describe("MRR", () => {
  it("vaut null sans abonnement, 0 si tous sont échus", () => {
    assert.deepEqual(monthlyRecurringRevenue([invoice({})], NOW), { mrr: null, actifs: 0 });
    assert.deepEqual(
      monthlyRecurringRevenue([invoice({ recurrence: "mensuel", emiseLe: "2026-08-01" })], NOW),
      { mrr: 0, actifs: 0 },
    );
  });

  it("ramène au mois les abonnements dont la période couvre aujourd'hui", () => {
    const result = monthlyRecurringRevenue(
      [
        invoice({ recurrence: "mensuel", montantHT: 150, emiseLe: "2026-10-05" }),
        invoice({ recurrence: "trimestriel", montantHT: 900, emiseLe: "2026-08-15" }),
        invoice({ recurrence: "annuel", montantHT: 1200, emiseLe: "2026-06-30", status: "payee" }),
        invoice({ recurrence: "mensuel", montantHT: 999, emiseLe: "2026-10-20", status: "brouillon" }),
        invoice({ recurrence: "mensuel", montantHT: 999, emiseLe: "2026-11-01" }), // à venir
        invoice({ recurrence: "mensuel", montantHT: 999, emiseLe: "2026-09-26" }), // échu le 26/10
        invoice({ recurrence: "mensuel", montantHT: 999, emiseLe: "2026-10-20", status: "annulee" }),
        invoice({ montantHT: 5000, emiseLe: "2026-10-20" }), // mission ponctuelle
      ],
      NOW,
    );
    assert.deepEqual(result, { mrr: 150 + 300 + 100, actifs: 3 });
  });

  it("gère les fins de mois (31 janvier + 1 mois = 28 février)", () => {
    const jan31 = [invoice({ recurrence: "mensuel", montantHT: 100, emiseLe: "2026-01-31" })];
    assert.equal(monthlyRecurringRevenue(jan31, Date.parse("2026-02-27T12:00:00Z")).actifs, 1);
    assert.equal(monthlyRecurringRevenue(jan31, Date.parse("2026-02-28T12:00:00Z")).actifs, 0);
  });
});

describe("Indicateurs de l'agence", () => {
  it("compte clients, missions, reste à encaisser et encaissements du mois", () => {
    const base = { creeLe: "2026-01-01T00:00:00.000Z", derniereActivite: "2026-10-01T00:00:00.000Z" };
    const mission = { clientId: "c", type: "agent_ia" as const, creeLe: base.creeLe };
    const m = computeMetrics(
      {
        clients: [
          { id: "a", nom: "A", statut: "actif", ...base },
          { id: "b", nom: "B", statut: "prospect", ...base },
          { id: "c", nom: "C", statut: "perdu", ...base },
        ],
        missions: [
          { id: "m1", code: "M1", titre: "x", statut: "en_cours", montantHT: 3000, ...mission },
          { id: "m2", code: "M2", titre: "x", statut: "signee", montantHT: 1000, ...mission },
          { id: "m3", code: "M3", titre: "x", statut: "proposition", montantHT: 9999, ...mission },
        ],
        invoices: [
          invoice({ resteDu: 120, joursRetard: 3 }),
          invoice({ status: "brouillon", resteDu: 500 }), // pas encore dû
          invoice({ status: "annulee", resteDu: 0 }),
          invoice({ status: "partiellement_payee", resteDu: 60 }),
        ],
        payments: [
          { id: "p1", numero: "R1", factureId: "i", montant: 60, date: "2026-10-03", mode: "virement", creeLe: "" },
          { id: "p2", numero: "R2", factureId: "i", montant: 500, date: "2026-09-30", mode: "virement", creeLe: "" },
        ],
        agents: [],
        agentActions: [],
      },
      NOW,
    );
    assert.equal(m.clientsActifs, 1);
    assert.equal(m.prospects, 1);
    assert.equal(m.missionsEnCours, 1);
    assert.equal(m.carnetCommandes, 4000);
    assert.equal(m.aEncaisser, 180);
    assert.equal(m.facturesEnRetard, 1);
    assert.equal(m.encaisseMois, 60);
  });
});
