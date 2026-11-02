import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkClient, checkInvoice, checkMission, checkPayment, nextNumber, settleInvoice, ttc } from "./business";

describe("Règles métier", () => {
  it("calcule le TTC au centime", () => {
    assert.equal(ttc(1000, 20), 1200);
    assert.equal(ttc(99.99, 5.5), 105.49);
    assert.equal(ttc(150, 0), 150);
  });

  it("numérote chaque série par année", () => {
    assert.equal(nextNumber("FA", 2026, []), "FA-2026-0001");
    assert.equal(nextNumber("FA", 2026, ["FA-2026-0009", "FA-2025-0042", "FA-2026-0010"]), "FA-2026-0011");
    assert.equal(nextNumber("REG", 2027, ["REG-2026-0003"]), "REG-2027-0001");
  });

  it("déduit le statut d'une facture de ses paiements", () => {
    assert.deepEqual(settleInvoice("emise", 1200, 400, "2026-10-05"), { status: "partiellement_payee" });
    assert.deepEqual(settleInvoice("partiellement_payee", 1200, 1200, "2026-10-20"), { status: "payee", payeeLe: "2026-10-20" });
    assert.deepEqual(settleInvoice("relance", 1200, 400, "2026-10-05"), { status: "relance" }, "reste en relance tant que non soldée");
    assert.deepEqual(settleInvoice("relance", 1200, 1199.996, "2026-10-05"), { status: "payee", payeeLe: "2026-10-05" });
    assert.deepEqual(settleInvoice("annulee", 1200, 1200, "2026-10-05"), { status: "annulee" });
  });

  it("valide une fiche client", () => {
    const ok = checkClient({ nom: "  Atelier Nord ", email: "Camille@Atelier.FR" });
    assert.ok(ok.ok);
    if (ok.ok) {
      assert.equal(ok.value.nom, "Atelier Nord");
      assert.equal(ok.value.email, "camille@atelier.fr");
      assert.equal(ok.value.statut, "prospect");
    }
    const ko = checkClient({ nom: "", email: "pas-une-adresse", statut: "vip" });
    assert.equal(ko.ok, false);
    if (!ko.ok) for (const e of [/Nom du client obligatoire/, /E-mail invalide/, /Statut invalide/]) assert.match(ko.error, e);
    const patch = checkClient({ statut: "actif" }, { partial: true });
    assert.deepEqual(patch, { ok: true, value: { statut: "actif" } });
    assert.equal(checkClient({ nom: " " }, { partial: true }).ok, false, "on n'efface pas le nom");
  });

  it("valide une mission et ses dates", () => {
    assert.ok(checkMission({ titre: "Agent IA", clientId: "cli-1", montantHT: "4 800,50" }).ok);
    const late = checkMission({ titre: "x", clientId: "c", debut: "2026-11-10", fin: "2026-11-01" });
    assert.equal(late.ok, false);
    assert.equal(checkMission({ titre: "x" }).ok, false, "client obligatoire");
  });

  it("valide une facture et un paiement", () => {
    const inv = checkInvoice({ clientId: "c", montantHT: "1490,5", emiseLe: "2026-10-01", echeance: "2026-10-31" });
    assert.ok(inv.ok);
    if (inv.ok) {
      assert.equal(inv.value.tauxTva, 20);
      assert.equal(inv.value.status, "emise");
      assert.equal(inv.value.montantHT, 1490.5);
    }
    assert.equal(checkInvoice({ clientId: "c", montantHT: 0, echeance: "2026-10-31" }).ok, false, "montant nul");
    assert.equal(checkInvoice({ clientId: "c", montantHT: 10, emiseLe: "2026-10-31", echeance: "2026-10-01" }).ok, false);
    assert.equal(checkInvoice({ clientId: "c", montantHT: 10, echeance: "2026-10-31", tauxTva: 150 }).ok, false);
    assert.ok(checkPayment({ factureId: "f", montant: "100", date: "2026-10-01", mode: "paypal" }).ok);
    assert.equal(checkPayment({ factureId: "f", montant: 10, date: "2999-01-01" }).ok, false, "pas de date future");
    assert.equal(checkPayment({ factureId: "f", montant: 10, mode: "bitcoin" }).ok, false);
  });
});
