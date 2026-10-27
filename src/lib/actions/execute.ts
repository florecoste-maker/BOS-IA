/**
 * Exécution des actions approuvées en file HITL. Seuls les brouillons d'e-mail
 * sont exécutables ; les autres actions restent à réaliser par l'équipe.
 * Le destinataire vient des données (apprenant ou client de facture), jamais du modèle.
 */
import type { Repository } from "@/lib/data";
import { getMailConfig, isEmail, sendMail } from "@/lib/mail";
import type { ActionExecution, AgentAction } from "@/lib/types";

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
  return execution;
}

async function run(repo: Repository, action: AgentAction): Promise<ActionExecution> {
  const draft = action.email;
  if (!draft) return result("a_faire", "Action à réaliser par l'équipe");

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
      `SMTP non configuré : envoyez-le vous-même à ${recipient.email}, ou configurez SMTP puis « Renvoyer »`,
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
    return result("echec", `Échec SMTP (${detail.slice(0, 200)}) : vérifiez la configuration puis « Renvoyer »`);
  }
}

/** Décision humaine puis, si approuvée, exécution immédiate. */
export async function decideAction(
  repo: Repository,
  actionId: string,
  decision: "approved" | "rejected",
  edits?: { objet?: string; corps?: string },
) {
  const action = await repo.resolveHitl(actionId, decision, edits);
  if (!action) throw new ActionError("Action introuvable ou déjà traitée", 409);
  if (decision === "approved" && action.email) {
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

/** Ajoute le destinataire résolu aux brouillons, pour la relecture humaine. */
export async function withRecipients(repo: Repository, actions: AgentAction[]) {
  return Promise.all(
    actions.map(async (action) => {
      if (!action.email) return action;
      const recipient = await repo.findRecipient(action.email);
      return {
        ...action,
        email: {
          ...action.email,
          destinataire: recipient ?? { nom: "Destinataire introuvable", email: null },
        },
      };
    }),
  );
}
