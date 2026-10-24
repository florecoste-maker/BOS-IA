/**
 * Point d'entrée de production (Hostinger Node.js Web App : fichier d'entrée `server.js`).
 * Lance le serveur autonome produit par `npm run build`.
 *
 * `HOSTNAME` est souvent rempli par le système avec le nom de la machine :
 * le serveur écouterait alors sur une interface que le proxy Hostinger
 * n'atteint pas (erreur 503). On écoute donc sur toutes les interfaces.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- fichier CommonJS exécuté directement par Node */
const { existsSync } = require("node:fs");
const path = require("node:path");

const standaloneServer = path.join(__dirname, ".next", "standalone", "server.js");

if (!existsSync(standaloneServer)) {
  console.error(`${standaloneServer} introuvable : lancez d'abord « npm run build ».`);
  process.exit(1);
}

process.env.HOSTNAME = process.env.BOS_LISTEN_HOST || "0.0.0.0";
require(standaloneServer);
