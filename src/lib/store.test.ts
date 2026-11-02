import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { store } from "./store";

describe("Données de démonstration de l'agence", () => {
  it("expose des indicateurs cohérents", () => {
    const m = store.getMetrics();
    assert.equal(m.clientsActifs, store.getClients().filter((c) => c.statut === "actif").length);
    assert.ok(m.prospects >= 1);
    assert.ok(m.missionsEnCours >= 1);
    assert.ok(m.agentsActifs >= 1);
    assert.equal(typeof m.mrr, "number");
    const owed = store
      .getInvoices()
      .filter((i) => i.status !== "brouillon" && i.status !== "annulee")
      .reduce((s, i) => s + i.resteDu, 0);
    assert.equal(m.aEncaisser, Math.round(owed * 100) / 100);
  });

  it("ne contient aucune donnée de formation", () => {
    const json = JSON.stringify({
      clients: store.getClients(),
      missions: store.getMissions(),
      invoices: store.getInvoices(),
      agents: store.getAgents(),
      actions: store.getAgentActions(),
    });
    assert.doesNotMatch(json, /apprenant|OPCO|Qualiopi|formation|learner/i);
  });

  it("crée un client, refuse un doublon et rattache une mission", () => {
    const created = store.createClient({ nom: "Nouvelle PME", statut: "prospect", email: "contact@pme.example" });
    assert.ok(created.ok);
    const twice = store.createClient({ nom: "nouvelle pme", statut: "actif" });
    assert.equal(twice.ok, false);
    if (!created.ok) return;
    const mission = store.createMission({
      titre: "Agent de prise de rendez-vous",
      clientId: created.value.id,
      type: "agent_ia",
      statut: "proposition",
      montantHT: 2000,
    });
    assert.ok(mission.ok);
    if (mission.ok) assert.match(mission.value.code, /^MIS-\d{4}-\d{4}$/);
    assert.equal(store.createMission({ titre: "x", clientId: "inconnu", type: "autre", statut: "proposition", montantHT: 0 }).ok, false);
  });

  it("facture, acompte puis solde : « partiellement payée » puis « payée »", () => {
    const client = store.getClients()[0];
    const created = store.createInvoice({
      clientId: client.id,
      montantHT: 1000,
      tauxTva: 20,
      status: "emise",
      emiseLe: "2026-10-01",
      echeance: "2026-10-31",
    });
    assert.ok(created.ok);
    if (!created.ok) return;
    assert.equal(created.value.montantTTC, 1200);
    assert.match(created.value.numero, /^FA-2026-\d{4}$/);

    const first = store.recordPayment({ factureId: created.value.id, montant: 400, date: "2026-10-05", mode: "virement" });
    assert.ok(first.ok);
    if (first.ok) {
      assert.equal(first.value.invoice.status, "partiellement_payee");
      assert.equal(first.value.invoice.resteDu, 800);
    }
    const tooMuch = store.recordPayment({ factureId: created.value.id, montant: 900, date: "2026-10-06", mode: "virement" });
    assert.equal(tooMuch.ok, false, "pas plus que le reste dû");

    const last = store.recordPayment({ factureId: created.value.id, montant: 800, date: "2026-10-20", mode: "carte" });
    assert.ok(last.ok);
    if (last.ok) {
      assert.equal(last.value.invoice.status, "payee");
      assert.equal(last.value.invoice.payeeLe, "2026-10-20");
      assert.equal(last.value.invoice.resteDu, 0);
    }
    assert.equal(store.recordPayment({ factureId: created.value.id, montant: 1, date: "2026-10-21", mode: "virement" }).ok, false);
    assert.equal(store.updateInvoiceStatus(created.value.id, "relance").ok, false, "facture payée verrouillée");
  });

  it("refuse un paiement sur un brouillon et une mission d'un autre client", () => {
    const [a, b] = store.getClients();
    const otherMission = store.getMissions().find((m) => m.clientId === b.id)!;
    assert.equal(
      store.createInvoice({ clientId: a.id, missionId: otherMission.id, montantHT: 10, tauxTva: 20, status: "emise", emiseLe: "2026-10-01", echeance: "2026-10-31" }).ok,
      false,
    );
    const draft = store.createInvoice({ clientId: a.id, montantHT: 10, tauxTva: 0, status: "brouillon", emiseLe: "2026-10-01", echeance: "2026-10-31" });
    assert.ok(draft.ok);
    if (draft.ok) {
      assert.equal(draft.value.joursRetard, 0, "un brouillon n'est jamais en retard");
      assert.equal(store.recordPayment({ factureId: draft.value.id, montant: 10, date: "2026-10-05", mode: "virement" }).ok, false);
    }
  });

  it("garde un seul interlocuteur principal par entreprise", () => {
    const added = store.createContact({ clientId: "cli-001", nom: "Nouveau", categorie: "interlocuteur", principal: true });
    assert.ok(added.ok);
    const principals = store.getContacts().filter((c) => c.clientId === "cli-001" && c.principal);
    assert.equal(principals.length, 1);
    assert.equal(principals[0].nom, "Nouveau");
    assert.ok(store.getContacts().some((c) => c.clientId === "cli-002" && c.principal), "autre entreprise inchangée");
    assert.equal(store.createContact({ clientId: "inconnu", nom: "x", categorie: "autre", principal: false }).ok, false);
  });

  it("devis : envoyé, accepté, facturé une seule fois", () => {
    const created = store.createQuote({
      clientId: "cli-004",
      objet: "Secrétaire IA",
      lignes: [
        { designation: "Mise en place", quantite: 1, prixUnitaireHT: 1500 },
        { designation: "Abonnement mensuel", quantite: 3, prixUnitaireHT: 99.9 },
      ],
      tauxTva: 20,
      status: "envoye",
      emisLe: "2026-10-01",
      valableJusquau: "2099-12-31",
    });
    assert.ok(created.ok);
    if (!created.ok) return;
    assert.match(created.value.numero, /^DEV-2026-\d{4}$/);
    assert.equal(created.value.montantHT, 1799.7);
    assert.equal(created.value.montantTTC, 2159.64);
    assert.equal(store.invoiceQuote(created.value.id).ok, false, "pas encore accepté");
    assert.ok(store.updateQuoteStatus(created.value.id, "accepte").ok);
    const invoiced = store.invoiceQuote(created.value.id);
    assert.ok(invoiced.ok);
    if (invoiced.ok) {
      assert.equal(invoiced.value.quote.status, "facture");
      assert.equal(invoiced.value.invoice.montantHT, 1799.7);
      assert.equal(invoiced.value.invoice.clientId, "cli-004");
      assert.equal(invoiced.value.invoice.status, "emise");
    }
    assert.equal(store.invoiceQuote(created.value.id).ok, false, "une seule facture");
    assert.equal(store.updateQuoteStatus(created.value.id, "refuse").ok, false, "devis facturé verrouillé");
  });

  it("exige HITL pour actions à risque", () => {
    const pending = store.getAgentActions().find((a) => a.hitlStatus === "pending");
    assert.ok(pending);
    const resolved = store.resolveHitl(pending!.id, "approved");
    assert.equal(resolved?.hitlStatus, "approved");
  });
});
