import { redirect } from "next/navigation";
import { brand } from "@/lib/brand";

/**
 * Pas de seconde page RDV publique : on renvoie vers la réservation
 * déjà en ligne sur jamaliance.com (Hostinger Horizons + TidyCal).
 */
export default function RendezVousPage() {
  redirect(brand.reservationUrl);
}
