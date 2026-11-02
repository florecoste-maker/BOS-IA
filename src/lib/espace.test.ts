import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getRepository } from "./data";
import { clientView } from "./espace";
import { store } from "./store";

describe("Espace d'une entreprise cliente", () => {
  it("ne contient que les données de cette entreprise", async () => {
    const repo = await getRepository();
    const space = (await repo.getSpace("cli-001"))!;
    assert.equal(space.client.id, "cli-001");
    assert.ok(space.contacts.length && space.missions.length && space.invoices.length && space.payments.length);
    assert.ok(space.contacts.every((c) => c.clientId === "cli-001"));
    assert.ok(space.missions.every((m) => m.clientId === "cli-001"));
    assert.ok(space.quotes.every((q) => q.clientId === "cli-001"));
    assert.ok(space.invoices.every((i) => i.clientId === "cli-001"));
    const own = new Set(space.invoices.map((i) => i.id));
    assert.ok(space.payments.every((p) => own.has(p.factureId)));
    const json = JSON.stringify(space);
    for (const other of store.getClients().filter((c) => c.id !== "cli-001")) {
      assert.equal(json.includes(other.nom), false, `aucune trace de ${other.nom}`);
    }
    assert.equal(await repo.getSpace("cli-inconnu"), null);
  });

  it("retire les informations internes à Jamaliance", async () => {
    const repo = await getRepository();
    const c = await repo.createClient({ nom: "Espace Test", statut: "prospect", notes: "NOTE-INTERNE", source: "SOURCE-INTERNE", email: "a@test.example" });
    assert.ok(c.ok);
    if (!c.ok) return;
    await repo.createContact({ clientId: c.value.id, nom: "Martin", categorie: "client", principal: false, notes: "NOTE-CONTACT" });
    await repo.createMission({ titre: "Visible", clientId: c.value.id, type: "agent_ia", statut: "en_cours", montantHT: 100, notes: "NOTE-MISSION" });
    await repo.createMission({ titre: "Annulée", clientId: c.value.id, type: "autre", statut: "annulee", montantHT: 1 });
    const line = [{ designation: "Ligne", quantite: 1, prixUnitaireHT: 100 }];
    const base = { clientId: c.value.id, lignes: line, tauxTva: 20, emisLe: "2026-10-01", valableJusquau: "2099-01-01" };
    await repo.createQuote({ ...base, objet: "BROUILLON-DEVIS", status: "brouillon" });
    await repo.createQuote({ ...base, objet: "Devis envoyé", status: "envoye" });
    const inv = { clientId: c.value.id, montantHT: 10, tauxTva: 20, emiseLe: "2026-10-01", echeance: "2026-10-31" };
    await repo.createInvoice({ ...inv, objet: "BROUILLON-FACTURE", status: "brouillon" });
    const sent = await repo.createInvoice({ ...inv, objet: "Facture émise", status: "emise" });
    assert.ok(sent.ok);
    if (sent.ok) await repo.recordPayment({ factureId: sent.value.id, montant: 5, date: "2026-10-02", mode: "paypal", reference: "REF-BANCAIRE" });

    const view = clientView((await repo.getSpace(c.value.id))!);
    const json = JSON.stringify(view);
    for (const secret of ["NOTE-INTERNE", "SOURCE-INTERNE", "NOTE-CONTACT", "NOTE-MISSION", "BROUILLON-DEVIS", "BROUILLON-FACTURE", "REF-BANCAIRE", "prospect"]) {
      assert.equal(json.includes(secret), false, secret);
    }
    assert.deepEqual(view.missions.map((m) => m.titre), ["Visible"]);
    assert.deepEqual(view.devis.map((d) => d.objet), ["Devis envoyé"]);
    assert.deepEqual(view.factures.map((f) => f.objet), ["Facture émise"]);
    assert.equal(view.paiements.length, 1);
    assert.equal(view.factures[0].resteDu, 7);
  });
});
