import { AppNav } from "@/components/ui";
import { isDatabaseConfigured } from "@/lib/db/config";

export default function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const demo = !isDatabaseConfigured();
  return (
    <div className="min-h-screen">
      <AppNav />
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
