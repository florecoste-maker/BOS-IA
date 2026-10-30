/**
 * Journal des actions : qui a fait quoi, quand, depuis quelle adresse.
 * Une écriture de journal qui échoue n'empêche jamais l'action elle-même.
 */
import { randomUUID } from "node:crypto";
import { getRepository } from "@/lib/data";
import type { Actor } from "@/lib/session";

export const SYSTEM_ACTOR = { id: "systeme", nom: "BOS-IA (automatique)" };

/** Libellés lisibles des actions journalisées. */
export const AUDIT_LABELS: Record<string, string> = {
  connexion: "Connexion",
  connexion_secours: "Connexion (compte de secours)",
  connexion_echouee: "Connexion refusée",
  deconnexion: "Déconnexion",
  hitl_approuve: "Proposition approuvée",
  hitl_refuse: "Proposition refusée",
  email_renvoye: "E-mail renvoyé",
  email_execution: "Envoi d'e-mail",
  email_test: "E-mail de test envoyé",
  email_test_echec: "E-mail de test en échec",
  analyse_lancee: "Analyse IA lancée",
  import: "Import",
  export: "Export",
  facture_payee: "Facture marquée payée",
  dossier_transmis: "Dossier OPCO transmis",
  apprenant_statut: "Statut d'apprenant modifié",
  apprenant_validation: "Compréhension validée",
  proof_to_cash: "Proof-to-cash",
  compte_cree: "Compte créé",
  compte_modifie: "Compte modifié",
  mot_de_passe: "Mot de passe modifié",
  installation: "Installation du cockpit",
};

/**
 * Cellule CSV sûre. Le journal contient des saisies non fiables (e-mail tapé lors
 * d'une connexion refusée) : une valeur commençant par = + - @ deviendrait une
 * formule dans Excel, d'où l'apostrophe ajoutée devant.
 */
export function csvCell(raw: string) {
  const value = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[;"\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Dernière entrée de X-Forwarded-For : celle ajoutée par le proxy Hostinger. */
export function clientIp(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() ||
    request.headers.get("x-real-ip") ||
    "inconnue"
  );
}

export async function audit(
  actor: Pick<Actor, "id" | "nom"> | null,
  action: string,
  objet: string,
  options: { details?: Record<string, unknown> | string; request?: Request } = {},
) {
  try {
    const who = actor ?? { id: "anonyme", nom: "Anonyme" };
    await (await getRepository()).recordAudit({
      id: `aud-${randomUUID()}`,
      le: new Date().toISOString(),
      utilisateurId: who.id,
      utilisateur: who.nom,
      action,
      objet,
      details:
        options.details === undefined
          ? undefined
          : typeof options.details === "string"
            ? options.details
            : JSON.stringify(options.details),
      ip: options.request ? clientIp(options.request) : undefined,
    });
  } catch (error) {
    console.error("Journal des actions non enregistré", error);
  }
}
