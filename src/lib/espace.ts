/**
 * Vue d'un espace client telle qu'un compte client la voit : uniquement les
 * données de son entreprise (déjà filtrées par la base, cf. Repository.getSpace)
 * et sans les informations internes à Jamaliance (notes, source, brouillons,
 * statut commercial, références bancaires).
 */
import type { SpaceData } from "./data";

export function clientView(space: SpaceData) {
  const { client } = space;
  const quotes = space.quotes.filter((q) => q.status !== "brouillon");
  const invoices = space.invoices.filter((i) => i.status !== "brouillon");
  const visibleInvoices = new Set(invoices.map((i) => i.id));
  return {
    entreprise: {
      nom: client.nom,
      contact: client.contact,
      email: client.email,
      telephone: client.telephone,
      secteur: client.secteur,
    },
    contacts: space.contacts.map((c) => ({
      id: c.id,
      nom: c.nom,
      prenom: c.prenom,
      fonction: c.fonction,
      email: c.email,
      telephone: c.telephone,
      categorie: c.categorie,
      principal: c.principal,
    })),
    missions: space.missions
      .filter((m) => m.statut !== "annulee")
      .map((m) => ({
        id: m.id,
        code: m.code,
        titre: m.titre,
        type: m.type,
        statut: m.statut,
        montantHT: m.montantHT,
        debut: m.debut,
        fin: m.fin,
      })),
    devis: quotes.map((q) => ({
      id: q.id,
      numero: q.numero,
      objet: q.objet,
      lignes: q.lignes,
      montantHT: q.montantHT,
      tauxTva: q.tauxTva,
      montantTTC: q.montantTTC,
      status: q.status,
      emisLe: q.emisLe,
      valableJusquau: q.valableJusquau,
    })),
    factures: invoices.map((i) => ({
      id: i.id,
      numero: i.numero,
      objet: i.objet,
      montantHT: i.montantHT,
      tauxTva: i.tauxTva,
      montantTTC: i.montantTTC,
      montantPaye: i.montantPaye,
      resteDu: i.resteDu,
      status: i.status,
      emiseLe: i.emiseLe,
      echeance: i.echeance,
      joursRetard: i.joursRetard,
      payeeLe: i.payeeLe,
    })),
    paiements: space.payments
      .filter((p) => visibleInvoices.has(p.factureId))
      .map((p) => ({ id: p.id, numero: p.numero, factureId: p.factureId, montant: p.montant, date: p.date, mode: p.mode })),
  };
}

export type ClientView = ReturnType<typeof clientView>;
