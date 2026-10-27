/**
 * Utilisateur courant : jeton de session signé, puis compte relu en base (actif,
 * rôle à jour). Le compte de secours (BOS_ADMIN_PASSWORD) n'a pas de fiche.
 */
import { cookies } from "next/headers";
import { SECOURS, SESSION_COOKIE, verifySessionToken, type SessionIdentity } from "@/lib/auth";
import { getRepository } from "@/lib/data";

export interface Actor {
  id: string;
  nom: string;
  role: "admin" | "membre";
  secours: boolean;
}

/** Désactive le compte de secours une fois les comptes nominatifs en place. */
export function isSecoursDisabled() {
  return process.env.BOS_SECOURS_DESACTIVE?.trim() === "1";
}

/** Vérifie qu'une identité de session correspond encore à un compte actif. */
export async function resolveActor(identity: SessionIdentity | null): Promise<Actor | null> {
  if (!identity) return null;
  if (identity.uid === SECOURS.uid) {
    return isSecoursDisabled() ? null : { id: SECOURS.uid, nom: SECOURS.nom, role: "admin", secours: true };
  }
  const user = await (await getRepository()).findUserById(identity.uid);
  if (!user || !user.actif) return null;
  return { id: user.id, nom: user.nom, role: user.role, secours: false };
}

export async function getActor(): Promise<Actor | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return resolveActor(verifySessionToken(token));
}
