/**
 * Config en JavaScript (et non TypeScript) : Next n'a pas besoin de SWC pour
 * la lire. Sur le serveur de build Hostinger (glibc < 2.30), le binaire natif
 * SWC ne se charge pas et la transpilation de `next.config.ts` échouait.
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
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
