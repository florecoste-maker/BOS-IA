/**
 * Config en JavaScript (et non TypeScript) : Next n'a pas besoin de SWC pour
 * la lire. Sur le serveur de build Hostinger, le binaire natif SWC ne se
 * charge pas (glibc trop ancienne pour la version gnu, « invalid ELF header »
 * pour la version musl) et la transpilation de `next.config.ts` échouait.
 */

/** En-têtes de sécurité appliqués à toutes les réponses du moteur BOS-IA. */
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

/**
 * Config compatible Hostinger Node.js Web Apps.
 * Sur l'hébergement géré, Hostinger injecte `output: "standalone"` au build.
 * On le fixe aussi ici pour les déploiements VPS / PM2 locaux.
 *
 * @type {import("next").NextConfig}
 */
const nextConfig = {
  output: "standalone",
  // Pilote MySQL et client SMTP chargés par Node tels quels (pas de bundling), copié dans standalone.
  serverExternalPackages: ["mysql2", "nodemailer"],
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  /**
   * bos.jamaliance.com est une ancienne adresse : toute visite est renvoyée vers
   * le cockpit retenu, app.jamaliance.com (l'accueil vers /app, les autres
   * chemins vers le même chemin). Redirection temporaire (307) : réversible,
   * jamais mise en cache définitivement par les navigateurs. Ne s'applique
   * qu'à cette adresse ; app.jamaliance.com n'est pas concerné.
   */
  async redirects() {
    const ancienneAdresse = [{ type: "host", value: "bos\\.jamaliance\\.com" }];
    return [
      { source: "/", has: ancienneAdresse, destination: "https://app.jamaliance.com/app", permanent: false },
      { source: "/:path+", has: ancienneAdresse, destination: "https://app.jamaliance.com/:path+", permanent: false },
    ];
  },
};

export default nextConfig;
