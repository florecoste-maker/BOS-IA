/**
 * Exécution des actions approuvées en file HITL : changement de statut d'une
 * fiche, puis envoi de l'e-mail s'il y en a un. Les autres actions restent à
 * réaliser par l'équipe. Le destinataire et la fiche viennent des données,
 * jamais du modèle.
 */
import { alertActionFailure, alertSendFailure } from "@/lib/alerts";
import type { HitlEdits, Repository } from "@/lib/data";
import { statusLabel } from "@/lib/format";
import { OPERATIONS, isAllowedValue } from "./operations";
import { getMailConfig, isEmail, sendMail } from "@/lib/mail";
import type {
  ActionExecution,
  AgentAction,
  EmailDraft,
  InvoiceStatus,
  LearnerStatus,
  OpcoStatus,
  StatusOperation,
} from "@/lib/types";

export class ActionError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function result(statut: ActionExecution["statut"], message: string): ActionExecution {
  return { statut, le: new Date().toISOString(), message };
}

/** Envoie l'e-mail d'une action approuvée. null si déjà en cours ou déjà envoyé. */
export async function executeAction(repo: Repository, actionId: string) {
  const action = await repo.claimExecution(actionId);
  if (!action) return null;

  let execution: ActionExecution;
  try {
    execution = await run(repo, action);
  } catch (error) {
    console.error("Exécution d'action échouée", error);
    execution = result("echec", "Erreur interne pendant l'exécution");
  }
  await repo.finishExecution(actionId, execution);
  if (execution.statut === "echec") {
    const alert = action.email
      ? alertSendFailure(action.email.objet, execution.message)
      : action.operation
        ? alertActionFailure(OPERATIONS[action.operation.type].libelle, execution.message)
        : null;
    await alert?.catch(() => {});
  }
  return execution;
}

/** Applique un changement de statut (idempotent : un renvoi le réapplique sans effet). */
async function applyOperation(repo: Repository, op: StatusOperation): Promise<ActionExecution> {
  if (!isAllowedValue(op.type, op.valeur)) {
    return result("echec", `Valeur « ${op.valeur} » non autorisée pour ${OPERATIONS[op.type].libelle.toLowerCase()}`);
  }
  const target = await repo.findOperationTarget(op);
  if (!target) return result("echec", `Fiche introuvable (${OPERATIONS[op.type].cible} ${op.refId} supprimé ?)`);
  const done =
    op.type === "statut_apprenant"
      ? await repo.updateLearnerStatus(op.refId, op.valeur as LearnerStatus)
      : op.type === "statut_dossier"
        ? await repo.updateDossierStatus(op.refId, op.valeur as OpcoStatus)
        : await repo.updateInvoiceStatus(op.refId, op.valeur as InvoiceStatus);
  if (!done) return result("echec", `Fiche introuvable (${OPERATIONS[op.type].cible} ${op.refId})`);
  return result("fait", `${target.libelle} : ${target.actuel} → ${statusLabel(op.valeur)}`);
}

async function run(repo: Repository, action: AgentAction): Promise<ActionExecution> {
  // 1. Changement de statut ; s'il échoue, l'e-mail ne part pas.
  const applied = action.operation ? await applyOperation(repo, action.operation) : null;
  if (applied?.statut === "echec") return applied;

  // 2. E-mail éventuel ; le message final rappelle le statut appliqué.
  const draft = action.email;
  if (!draft) return applied ?? result("a_faire", "Action à réaliser par l'équipe");
  const sent = await sendDraft(repo, draft);
  return applied ? { ...sent, message: `${applied.message} ; ${sent.message}` } : sent;
}

async function sendDraft(repo: Repository, draft: EmailDraft): Promise<ActionExecution> {
  if (repo.mode === "demo") {
    return result("simule", "Mode démonstration : aucun e-mail envoyé");
  }

  const recipient = await repo.findRecipient(draft);
  if (!recipient) {
    return result("echec", `Destinataire introuvable (${draft.cible} ${draft.refId} supprimé ?)`);
  }
  if (!isEmail(recipient.email)) {
    return result(
      "echec",
      draft.cible === "facture"
        ? `Pas d'adresse e-mail pour le client ${recipient.nom} : ajoutez la colonne email_client à l'import des factures`
        : `Adresse e-mail invalide pour ${recipient.nom}`,
    );
  }

  const config = getMailConfig();
  if (!config) {
    return result(
      "a_faire",
      `SMTP non configuré : envoyez-le vous-même à ${recipient.email}, ou configurez SMTP puis « Réessayer »`,
    );
  }

  try {
    const sent = await sendMail(config, { to: recipient.email, subject: draft.objet, text: draft.corps });
    return result(
      "envoye",
      config.redirection
        ? `Mode test : envoyé à ${sent.to} au lieu de ${recipient.email}`
        : `Envoyé à ${recipient.nom} <${sent.to}>`,
    );
  } catch (error) {
    const e = error as { code?: string; responseCode?: number; response?: string };
    const detail = e.responseCode ? `${e.responseCode} ${e.response ?? ""}`.trim() : (e.code ?? "erreur");
    return result("echec", `Échec SMTP (${detail.slice(0, 200)}) : vérifiez la configuration puis « Réessayer »`);
  }
}

/** Décision humaine puis, si approuvée, exécution immédiate. */
export async function decideAction(
  repo: Repository,
  actionId: string,
  decision: "approved" | "rejected",
  edits?: HitlEdits,
  decidePar?: string,
) {
  const action = await repo.resolveHitl(actionId, decision, edits, decidePar);
  if (!action) throw new ActionError("Action introuvable ou déjà traitée", 409);
  if (decision === "approved" && (action.email || action.operation)) {
    const execution = await executeAction(repo, actionId);
    if (execution) action.execution = execution;
  }
  return action;
}

/** Nouvel essai après un échec ou une configuration manquante. */
export async function retryAction(repo: Repository, actionId: string) {
  const execution = await executeAction(repo, actionId);
  if (!execution) throw new ActionError("Rien à renvoyer : déjà envoyé, en cours, ou non approuvé", 409);
  return execution;
}

/** Ajoute le destinataire et la fiche visée (statut actuel), pour la relecture humaine. */
export async function withRecipients(repo: Repository, actions: AgentAction[]) {
  return Promise.all(
    actions.map(async (action) => {
      let enriched = action;
      if (action.email) {
        const recipient = await repo.findRecipient(action.email);
        enriched = {
          ...enriched,
          email: { ...action.email, destinataire: recipient ?? { nom: "Destinataire introuvable", email: null } },
        };
      }
      if (action.operation) {
        const cible = await repo.findOperationTarget(action.operation);
        enriched = {
          ...enriched,
          operation: { ...action.operation, cible: cible ?? { libelle: "Fiche introuvable", actuel: "—" } },
        };
      }
      return enriched;
    }),
  );
}
