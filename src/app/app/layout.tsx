import { AppNav } from "@/components/ui";
import { isDatabaseConfigured } from "@/lib/db/config";
import { redirect } from "next/navigation";
import { getActor } from "@/lib/session";

export default async function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const demo = !isDatabaseConfigured();
  const actor = await getActor();
  // Seconde barrière après le proxy : compte désactivé ou session invalide.
  if (!actor) redirect("/login");
  return (
    <div className="min-h-screen">
      <AppNav user={actor ? { nom: actor.nom, admin: actor.role === "admin" } : null} />
      {actor?.secours ? (
        <p className="border-b border-danger/30 bg-danger/10 px-4 py-2 text-center text-sm text-ink">
          Connecté avec le mot de passe de secours : vos actions ne sont pas nominatives.
          Créez votre compte dans « Comptes », puis reconnectez-vous avec votre e-mail.
        </p>
      ) : null}
      {demo ? (
        <p className="border-b border-warn/30 bg-warn/10 px-4 py-2 text-center text-sm text-ink">
          Mode démonstration : données fictives en mémoire, réinitialisées à chaque
          redémarrage. Connectez la base MySQL (voir Connexions) pour travailler sur vos
          vraies données.
        </p>
      ) : null}
      <main className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-10">{children}</main>
    </div>
  );
}
