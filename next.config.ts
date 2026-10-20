import type { NextConfig } from "next";

/**
 * Config compatible Hostinger Node.js Web Apps.
 * Sur l'hébergement géré, Hostinger injecte `output: "standalone"` au build.
 * On le fixe aussi ici pour les déploiements VPS / PM2 locaux.
 */
const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
