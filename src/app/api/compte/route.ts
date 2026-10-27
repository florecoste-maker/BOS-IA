import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { getRepository } from "@/lib/data";
import { getActor } from "@/lib/session";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/users/password";

export const dynamic = "force-dynamic";

/** Changer son propre mot de passe (mot de passe actuel requis). */
export async function PATCH(request: Request) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  if (actor.secours) {
    return NextResponse.json(
      { error: "Le compte de secours se change dans hPanel (BOS_ADMIN_PASSWORD)" },
      { status: 400 },
    );
  }
  const body = (await request.json().catch(() => ({}))) as { actuel?: string; nouveau?: string };
  const repo = await getRepository();
  const user = await repo.findUserById(actor.id);
  const found = user ? await repo.findUserForLogin(user.email) : null;
  if (!found || !(await verifyPassword(body.actuel ?? "", found.passwordHash))) {
    return NextResponse.json({ error: "Mot de passe actuel incorrect" }, { status: 400 });
  }
  const problem = passwordProblem(body.nouveau ?? "");
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  await repo.updateUser(actor.id, { passwordHash: await hashPassword(body.nouveau!) });
  await audit(actor, "mot_de_passe", actor.nom, { details: "changé par l'utilisateur", request });
  return NextResponse.json({ ok: true });
}
