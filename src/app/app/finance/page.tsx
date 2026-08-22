import { FinanceClient } from "@/components/finance-client";
import { SectionTitle } from "@/components/ui";
import { store } from "@/lib/store";

export const dynamic = "force-dynamic";

export default function FinancePage() {
  return (
    <>
      <SectionTitle
        eyebrow="Pilier 2 — ERP OPCO-Ready"
        title="Machine administrative & financière"
        description="Complétude des dossiers de financement, facturation 30/70 et suivi du délai de paiement cible sous 30 jours."
      />
      <FinanceClient
        initialDossiers={store.getOpcoDossiers()}
        initialInvoices={store.getInvoices()}
      />
    </>
  );
}
