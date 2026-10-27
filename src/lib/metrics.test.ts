import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { monthlyRecurringRevenue, paymentDelay } from "./metrics";
import type { Invoice } from "./types";

const NOW = Date.parse("2026-10-27T10:00:00Z");

function invoice(partial: Partial<Invoice>): Invoice {
  return {
    id: "i",
    numero: "FA",
    client: "C",
    montantHT: 100,
    acomptePct: 0,
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
        invoice({ montantHT: 5000, emiseLe: "2026-10-20" }), // formation ponctuelle
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
