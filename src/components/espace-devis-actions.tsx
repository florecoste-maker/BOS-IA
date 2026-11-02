"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/**
 * Acceptation ou refus d'un devis par le client, en deux temps : le premier
 * clic affiche le montant et demande confirmation, le second enregistre.
 */
export function EspaceDevisActions({ devisId, numero, montant }: { devisId: string; numero: string; montant: string }) {
  const router = useRouter();
  const [step, setStep] = useState<"choix" | "accepter" | "refuser">("choix");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm(action: "accepter" | "refuser") {
    startTransition(async () => {
      try {
        const res = await fetch("/api/espace", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, devisId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error ?? "Erreur");
          return;
        }
        router.refresh();
      } catch {
        setError("Connexion au serveur impossible.");
      }
    });
  }

  const primary = "bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-deep disabled:opacity-50";
  const secondary = "border border-line px-4 py-2 text-sm font-semibold hover:border-brand/40 disabled:opacity-50";

  return (
    <div className="mt-3">
      {error ? <p className="mb-2 border-l-2 border-danger bg-surface px-3 py-2 text-sm">{error}</p> : null}
      {step === "choix" ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={primary} onClick={() => setStep("accepter")}>
            Accepter le devis
          </button>
          <button type="button" className={secondary} onClick={() => setStep("refuser")}>
            Refuser
          </button>
        </div>
      ) : (
        <div className="border border-line bg-surface p-3 text-sm">
          <p>
            {step === "accepter"
              ? `Vous acceptez le devis ${numero} d'un montant de ${montant} TTC. Jamaliance sera prévenue et vous adressera la facture.`
              : `Vous refusez le devis ${numero}. Jamaliance en sera informée.`}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={pending} className={primary} onClick={() => confirm(step)}>
              {step === "accepter" ? "Confirmer l'acceptation" : "Confirmer le refus"}
            </button>
            <button type="button" disabled={pending} className={secondary} onClick={() => setStep("choix")}>
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
