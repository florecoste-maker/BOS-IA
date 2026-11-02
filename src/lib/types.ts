/** Données de référence — domaines métier de l'agence Jamaliance (agents IA pour les entreprises). */

/** Cycle de vie d'un client : du premier contact à la fin de la relation. */
export type ClientStatus = "prospect" | "actif" | "inactif" | "perdu";

/** Entreprise cliente (ou prospect), avec son contact principal. */
export interface Client {
  id: string;
  /** Raison sociale : identifiant lisible et unique. */
  nom: string;
  /** Nom du contact principal. */
  contact?: string;
  /** Adresse du contact : sert aux e-mails approuvés et aux relances de factures. */
  email?: string;
  telephone?: string;
  secteur?: string;
  statut: ClientStatus;
  /** Origine du contact (site, recommandation, salon…). */
  source?: string;
  notes?: string;
  creeLe: string;
  derniereActivite: string;
}

/** Nature d'une mission vendue par l'agence. */
export type MissionType = "agent_ia" | "automatisation" | "conseil" | "abonnement" | "autre";

export type MissionStatus = "proposition" | "signee" | "en_cours" | "livree" | "terminee" | "annulee";

/** Prestation pour un client : projet d'agent IA, automatisation, accompagnement, abonnement… */
export interface Mission {
  id: string;
  /** Référence lisible et unique, ex. MIS-2026-0001. */
  code: string;
  titre: string;
  clientId: string;
  type: MissionType;
  statut: MissionStatus;
  montantHT: number;
  /** AAAA-MM-JJ */
  debut?: string;
  /** Livraison ou fin prévue (AAAA-MM-JJ). */
  fin?: string;
  notes?: string;
  creeLe: string;
}

/**
 * « payée » et « partiellement payée » découlent des paiements enregistrés ;
 * « annulée » reste un geste humain.
 */
export type InvoiceStatus =
  | "brouillon"
  | "emise"
  | "partiellement_payee"
  | "payee"
  | "relance"
  | "impayee"
  | "annulee";

export type InvoiceRecurrence = "mensuel" | "trimestriel" | "annuel";

export interface Invoice {
  id: string;
  numero: string;
  clientId: string;
  /** Nom du client (lu sur la fiche client). */
  client: string;
  missionId?: string;
  /** Objet de la facture, ex. « Agent IA support client — acompte ». */
  objet?: string;
  montantHT: number;
  /** Taux de TVA en % (20 par défaut, 0 en franchise). */
  tauxTva: number;
  montantTTC: number;
  status: InvoiceStatus;
  emiseLe: string;
  echeance: string;
  joursRetard: number;
  /** Adresse du client pour les relances (lue sur la fiche client). */
  emailClient?: string;
  /** Total des paiements enregistrés (TTC). */
  montantPaye: number;
  /** Reste à encaisser (TTC) ; 0 pour une facture payée ou annulée. */
  resteDu: number;
  /** Date du paiement qui a soldé la facture (AAAA-MM-JJ) : sert au délai de paiement moyen. */
  payeeLe?: string;
  /** Facture d'abonnement : sert au MRR (montant ramené au mois). */
  recurrence?: InvoiceRecurrence;
}

export type PaymentMode =
  | "virement"
  | "carte"
  | "prelevement"
  | "cheque"
  | "especes"
  | "stripe"
  | "paypal"
  | "autre";

/** Règlement reçu pour une facture (acompte, solde ou paiement unique). */
export interface Payment {
  id: string;
  /** Numéro lisible et unique, ex. REG-2026-0001. */
  numero: string;
  factureId: string;
  /** Montant TTC reçu. */
  montant: number;
  /** AAAA-MM-JJ */
  date: string;
  mode: PaymentMode;
  /** Référence bancaire, numéro de transaction… */
  reference?: string;
  creeLe: string;
}

export type AgentTier = "QAA" | "IPOA" | "FCA" | "MDGA";
export type AgentAutonomy =
  | "quality_assured"
  | "informed_proactive"
  | "monitored_delegated";

export interface Agent {
  id: string;
  nom: string;
  role: string;
  tier: AgentTier;
  autonomy: AgentAutonomy;
  status: "actif" | "en_attente_hitl" | "pause" | "erreur";
  derniereAction: string;
  risque: "faible" | "moyen" | "eleve";
  hitlObligatoire: boolean;
}

export interface AgentAction {
  id: string;
  agentId: string;
  type: string;
  description: string;
  timestamp: string;
  requiresHitl: boolean;
  hitlStatus?: "pending" | "approved" | "rejected";
  /** Brouillon d'e-mail : le destinataire est résolu côté serveur, jamais fourni par le modèle. */
  email?: EmailDraft;
  /** Changement de statut d'une fiche existante, appliqué après approbation. */
  operation?: StatusOperation;
  /** Résultat de l'exécution après approbation. */
  execution?: ActionExecution;
  /** Auteur et date de la décision humaine. */
  decidePar?: string;
  decideLe?: string;
}

export interface EmailDraft {
  /** « client » : le contact du client `refId` ; « facture » : le client de la facture `refId`. */
  cible: "client" | "facture";
  refId: string;
  objet: string;
  corps: string;
  /** Renseigné pour l'affichage (adresse résolue), jamais stocké. */
  destinataire?: { nom: string; email: string | null };
}

export type OperationType = "statut_client" | "statut_mission" | "statut_facture";

export interface StatusOperation {
  type: OperationType;
  /** id du client, de la mission ou de la facture. */
  refId: string;
  /** Nouveau statut (liste fermée par type, voir lib/actions/operations). */
  valeur: string;
  /** Renseigné pour l'affichage (fiche et statut actuel), jamais stocké. */
  cible?: { libelle: string; actuel: string };
}

export interface ActionExecution {
  /** « fait » : changement de statut appliqué, sans e-mail. */
  statut: "en_cours" | "envoye" | "fait" | "echec" | "simule" | "a_faire";
  le: string;
  message: string;
}

export interface DashboardMetrics {
  clientsActifs: number;
  prospects: number;
  missionsEnCours: number;
  /** Missions signées, en cours ou livrées (HT). */
  carnetCommandes: number;
  facturesEnRetard: number;
  /** Reste à encaisser sur les factures émises (TTC). */
  aEncaisser: number;
  /** Paiements reçus depuis le 1er du mois (TTC). */
  encaisseMois: number;
  /** Jours entre émission et paiement complet, moyenne sur 12 mois ; null sans facture payée datée. */
  delaiPaiementMoyen: number | null;
  /** Nombre de factures payées prises en compte dans le délai moyen. */
  delaiPaiementBase: number;
  /** Revenu mensuel récurrent HT ; null sans facture d'abonnement. */
  mrr: number | null;
  /** Abonnements dont la période couvre aujourd'hui. */
  abonnementsActifs: number;
  agentsActifs: number;
  actionsHitl: number;
}

/** Journal d'une exécution d'agent (manuelle ou planifiée). */
export interface AgentRunLog {
  id: string;
  agentId: string;
  declencheur: "manuel" | "planifie";
  debut: string;
  fin: string;
  statut: "succes" | "echec" | "ignore";
  message: string;
  actions: number;
  model?: string;
}

/** Compte nominatif (le hash du mot de passe ne sort jamais de la couche données). */
export interface User {
  id: string;
  email: string;
  nom: string;
  role: "admin" | "membre";
  actif: boolean;
  creeLe: string;
  derniereConnexion?: string;
}

/** Entrée du journal des actions : qui, quoi, quand, d'où. */
export interface AuditEntry {
  id: string;
  le: string;
  utilisateurId: string;
  utilisateur: string;
  action: string;
  objet: string;
  details?: string;
  ip?: string;
}
