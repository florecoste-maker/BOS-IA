import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { getRepository } from "@/lib/data";
import { isEmail } from "@/lib/mail";
import { getActor } from "@/lib/session";
import type { User } from "@/lib/types";
import { hashPassword, passwordProblem } from "@/lib/users/password";

export const dynamic = "force-dynamic";

/** Réservé aux administrateurs (contrôlé par le proxy, revérifié ici). */
async function requireAdmin() {
  const actor = await getActor();
  return actor?.role === "admin" ? actor : null;
}

const forbidden = () => NextResponse.json({ error: "Réservé aux administrateurs" }, { status: 403 });

export async function GET() {
  if (!(await requireAdmin())) return forbidden();
  return NextResponse.json({ users: await (await getRepository()).listUsers() });
}

export async function POST(request: Request) {
  const actor = await requireAdmin();
  if (!actor) return forbidden();
  const body = (await request.json().catch(() => ({}))) as {
    email?: string;
    nom?: string;
    role?: string;
    motDePasse?: string;
  };
  const email = body.email?.trim().toLowerCase() ?? "";
  const nom = body.nom?.trim() ?? "";
  const role = body.role === "admin" ? "admin" : body.role === "membre" ? "membre" : null;
  if (!isEmail(email)) return NextResponse.json({ error: "Adresse e-mail invalide" }, { status: 400 });
  if (!nom || nom.length > 120) return NextResponse.json({ error: "Nom requis (120 caractères maximum)" }, { status: 400 });
  if (!role) return NextResponse.json({ error: "Rôle : admin ou membre" }, { status: 400 });
  const problem = passwordProblem(body.motDePasse ?? "");
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const user = await (await getRepository()).createUser({
    email,
    nom,
    role,
    passwordHash: await hashPassword(body.motDePasse!),
  });
  if (!user) return NextResponse.json({ error: "Un compte existe déjà avec cet e-mail" }, { status: 409 });
  await audit(actor, "compte_cree", `${nom} <${email}>`, { details: { role }, request });
  return NextResponse.json({ user }, { status: 201 });
}

/** Modifier nom, rôle, activation ou mot de passe d'un compte. */
export async function PATCH(request: Request) {
  const actor = await requireAdmin();
  if (!actor) return forbidden();
  const body = (await request.json().catch(() => ({}))) as {
    id?: string;
    nom?: string;
    role?: string;
    actif?: boolean;
    motDePasse?: string;
  };
  const repo = await getRepository();
  const target = body.id ? await repo.findUserById(body.id) : null;
  if (!target) return NextResponse.json({ error: "Compte introuvable" }, { status: 404 });

  const role = body.role === "admin" || body.role === "membre" ? (body.role as User["role"]) : undefined;
  const actif = typeof body.actif === "boolean" ? body.actif : undefined;
  const nom = body.nom?.trim() || undefined;
  const losesAdmin = target.role === "admin" && target.actif && (role === "membre" || actif === false);

  if (target.id === actor.id && (actif === false || role === "membre")) {
    return NextResponse.json(
      { error: "Vous ne pouvez pas désactiver ni rétrograder votre propre compte" },
      { status: 400 },
    );
  }
  if (losesAdmin) {
    const admins = (await repo.listUsers()).filter((u) => u.role === "admin" && u.actif);
    if (admins.length <= 1) {
      return NextResponse.json({ error: "Il doit rester au moins un administrateur actif" }, { status: 400 });
    }
  }
  let passwordHash: string | undefined;
  if (body.motDePasse) {
    const problem = passwordProblem(body.motDePasse);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    passwordHash = await hashPassword(body.motDePasse);
  }

  const user = await repo.updateUser(target.id, { nom, role, actif, passwordHash });
  const changes = {
    ...(nom && nom !== target.nom ? { nom } : {}),
    ...(role && role !== target.role ? { role } : {}),
    ...(actif !== undefined && actif !== target.actif ? { actif } : {}),
  };
  if (Object.keys(changes).length) {
    await audit(actor, "compte_modifie", `${target.nom} <${target.email}>`, { details: changes, request });
  }
  if (passwordHash) {
    await audit(actor, "mot_de_passe", `${target.nom} <${target.email}>`, { details: "réinitialisé par un administrateur", request });
  }
  return NextResponse.json({ user });
}
