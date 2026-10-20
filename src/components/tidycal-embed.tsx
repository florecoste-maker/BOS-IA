import { getTidyCalPublicConfig } from "@/lib/integrations/config";
import { brand } from "@/lib/brand";

export function TidyCalEmbed({
  title = "Réserver un échange",
  description = "Choisissez un créneau. Chaque demande peut rester soumise à confirmation — vous gardez le contrôle.",
}: {
  title?: string;
  description?: string;
}) {
  const { bookingUrl, embedUrl } = getTidyCalPublicConfig();

  if (!bookingUrl) {
    return (
      <div className="border border-dashed border-line bg-surface/70 px-5 py-8">
        <p className="font-display text-lg font-semibold text-ink">{title}</p>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-muted">
          Aperçu calendrier non configuré ici. Les clients réservent déjà sur{" "}
          <a
            href={brand.reservationUrl}
            className="font-semibold text-brand hover:text-brand-deep"
          >
            jamaliance.com/reservation
          </a>
          . Pour l&apos;embed dans le cockpit, ajoutez{" "}
          <code className="text-brand-deep">NEXT_PUBLIC_TIDYCAL_URL</code> dans
          hPanel.
        </p>
        <a
          href={brand.reservationUrl}
          className="mt-5 inline-flex text-sm font-semibold text-brand hover:text-brand-deep"
        >
          Ouvrir la réservation publique →
        </a>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">
          TidyCal · {brand.agency}
        </p>
        <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink md:text-3xl">
          {title}
        </h2>
        <p className="mt-3 text-base leading-relaxed text-ink-muted">
          {description}
        </p>
      </div>

      {embedUrl ? (
        <iframe
          title="Calendrier TidyCal Jamaliance"
          src={embedUrl}
          className="h-[720px] w-full border border-line bg-surface"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      ) : null}

      <p className="mt-4 text-sm text-ink-muted">
        Ou ouvrez le calendrier dans un nouvel onglet :{" "}
        <a
          href={bookingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-brand hover:text-brand-deep"
        >
          {bookingUrl}
        </a>
      </p>
    </div>
  );
}
