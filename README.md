# Jamaliance · BOS-IA

**BOS-IA** est le moteur opérationnel de l'agence **Jamaliance** — pas un second site vitrine.

| Couche | URL | Hébergement |
|--------|-----|-------------|
| Vitrine publique | [jamaliance.com](https://jamaliance.com) | Hostinger Horizons (**ne pas remplacer**) |
| Moteur BOS-IA | [app.jamaliance.com](https://app.jamaliance.com) | Hostinger Web App Node.js (en ligne) |
| Rendez-vous clients | [jamaliance.com/reservation](https://jamaliance.com/reservation) | Horizons + TidyCal (déjà en ligne) |

## Ce qui existe déjà

| Élément | État |
|--------|------|
| App Next.js BOS-IA (LMS, ERP OPCO, Digital Nexus HITL) | ✅ Présent |
| Entrée moteur `/` (pas de landing marketing) | ✅ Préparé |
| Redirection `/rendez-vous` → site public | ✅ Préparé |
| Cockpit `/app/*` | ✅ Présent |
| API TidyCal (`/api/integrations/tidycal`) | ✅ Prêt (jeton API optionnel pour l'embed) |
| Statut connexions (`/app/integrations`) | ✅ Prêt |
| Accès protégé par mot de passe (`/login`, `/app/*`, `/api/*`) | ✅ Prêt (fermé tant que non configuré) |
| Agents IA connectés à l'API Claude (`POST /api/agents/run`) | ✅ Prêt (clé `ANTHROPIC_API_KEY` requise) |
| Base de données MySQL / MariaDB (données persistantes) | ✅ Prêt (variables `DB_*` requises, sinon mode démo) |
| Import CSV / Excel (`/app/import`) | ✅ Prêt (nécessite la base) |
| CI GitHub (lint, tests, build, test MySQL 8) | ✅ Prêt |
| Config Hostinger `standalone` + `.env.example` | ✅ Prêt |
| Déploiement sur `app.jamaliance.com` | ✅ En ligne |

## Dépôts

`florecoste-maker/BOS-IA` et `florecoste-maker/BOS-IA-Hostinger` contiennent
**le même code**. Toute modification doit être faite dans les deux, ou l'un des
deux doit être archivé. Le dépôt réellement déployé est celui choisi dans hPanel
(Sites web → app.jamaliance.com → Git) : `GET /api/health` répond `{"ok":true}`
quand la version déployée inclut l'accès protégé.

## Démarrage local

```bash
cp .env.example .env.local   # puis renseigner BOS_ADMIN_PASSWORD et BOS_SESSION_SECRET
npm install
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000) → entrée moteur → `/app`.

```bash
npm run build   # + copie des assets standalone
npm start       # serveur de production
npm test
npm run lint
```

## Parcours

| Route | Rôle |
|-------|------|
| `/` | Entrée moteur (lien vitrine + cockpit) |
| `/rendez-vous` | Redirige vers jamaliance.com/reservation |
| `/app` | Cockpit BOS-IA |
| `/app/formation` | Pipeline formation |
| `/app/finance` | Dossiers OPCO & factures |
| `/app/agents` | Supervision multi-agents + HITL |
| `/app/import` | Import CSV / Excel des données |
| `/app/integrations` | État Hostinger / TidyCal (+ aperçu calendrier) |

## Déploiement Hostinger (app.jamaliance.com)

**Prérequis plan :** Business ou Cloud avec *Web Apps Node.js*.

1. hPanel → **Sites web** → **Web App / Node.js**, source GitHub
   `florecoste-maker/BOS-IA-Hostinger` (ou `florecoste-maker/BOS-IA`, identique), branche `main`
2. Réglages de build :

   | Champ | Valeur |
   |-------|--------|
   | Framework | Next.js |
   | Version Node | 22 (minimum 20.9) |
   | Commande d'installation | `npm ci` |
   | Commande de build | `npm run build` |
   | Commande de démarrage | `npm start` |
   | Fichier d'entrée (si demandé) | `server.js` |
   | Dossier de sortie | `.next` |

   Le serveur de build Hostinger ne peut pas charger le binaire natif SWC de
   Next 16 (`GLIBC_2.29 not found` pour la version gnu, `invalid ELF header`
   pour la version musl). D'où :
   - `next.config.mjs` (pas de `.ts` : la config se lit sans SWC) ;
   - `npm run build` = `next build --webpack` (Turbopack n'existe qu'en natif) ;
   - `@next/swc-wasm-nodejs` installé : Next bascule automatiquement sur SWC
     WebAssembly quand le binaire natif ne se charge pas.

   Les outils nécessaires au build (TypeScript, Tailwind) sont dans
   `dependencies` : le build fonctionne même si Hostinger installe en mode
   production (`NODE_ENV=production`).

3. Domaine / sous-domaine : **app.jamaliance.com** (laisser jamaliance.com sur Horizons)
4. Variables d'environnement **obligatoires** pour ouvrir le cockpit :
   `BOS_ADMIN_PASSWORD` (12 caractères minimum) et `BOS_SESSION_SECRET`
   (32 caractères minimum, `openssl rand -hex 32`). Sans elles, `/app` et `/api`
   restent fermés (page de connexion avec un message de configuration).
5. Les URLs ont des valeurs Jamaliance par défaut (`https://jamaliance.com`,
   `https://app.jamaliance.com`, calendrier TidyCal de jamaliance.com/reservation) ;
   les variables `NEXT_PUBLIC_*` de `.env.example` ne servent qu'à les changer et
   sont figées **au build** : après modification, redéployer.
6. Agents IA : `ANTHROPIC_API_KEY` (console.anthropic.com → API Keys).
7. Base de données : voir « Base de données » ci-dessous (`DB_HOST`, `DB_NAME`,
   `DB_USER`, `DB_PASSWORD`).
8. Optionnel : `TIDYCAL_API_TOKEN` pour l'API (l'embed public vit déjà sur le site Horizons)
9. Vérifier : `https://app.jamaliance.com/api/health` répond `{"ok":true}`, puis se
   connecter sur `https://app.jamaliance.com/login`.

`npm run build` exécute ensuite `scripts/prepare-standalone.mjs`, qui copie
`public/` et `.next/static/` dans `.next/standalone/` ; `npm start` lance
`node server.js`, qui démarre `.next/standalone/server.js` sur `0.0.0.0` (port lu
dans `PORT`). L'écoute ne dépend donc pas de la variable système `HOSTNAME`.

## Base de données

Sans base configurée, le cockpit tourne en **mode démonstration** : données fictives
en mémoire, réinitialisées à chaque redémarrage, signalées par un bandeau.

Pour les données réelles (MySQL ou MariaDB Hostinger) :

1. hPanel → **Bases de données** → **Gestion** : créer une base et un utilisateur
   (Hostinger préfixe les noms, par ex. `u123456789_bosia`).
2. Ajouter dans les variables d'environnement de la Web App : `DB_HOST` (souvent
   `localhost`, sinon l'hôte indiqué par hPanel), `DB_NAME`, `DB_USER`, `DB_PASSWORD`
   — ou une seule `DATABASE_URL=mysql://utilisateur:motdepasse@hote:3306/base`.
3. Redémarrer / redéployer. Au premier accès, les tables `bos_*` sont créées et les
   6 agents enregistrés. **Aucune donnée fictive** n'est insérée.
4. Vérifier `/app/integrations` → carte « Base de données » : « MySQL connecté ».

Les indicateurs sont calculés à partir des données. Le délai de paiement et le MRR
affichent « — » : les données ne contiennent ni date de paiement ni abonnement.
Les jours de retard des factures sont calculés à partir de l'échéance.

## Import CSV / Excel

`/app/import` charge les sessions, apprenants, dossiers OPCO et factures depuis un
fichier `.xlsx` (première feuille) ou CSV (séparateur `;`, `,` ou tabulation ;
UTF-8 ou Windows-1252, comme les CSV d'Excel en français). Un modèle par type est
téléchargeable sur la page.

- Ordre : sessions → apprenants → dossiers OPCO → factures (références par code de
  session, e-mail d'apprenant, référence de dossier).
- **Vérifier** affiche toutes les erreurs ligne par ligne sans rien écrire ;
  **Importer** écrit tout ou rien, dans une transaction.
- Une ligne existante (même code, e-mail, référence ou numéro) est mise à jour ;
  une cellule vide conserve la valeur enregistrée.
- Valeurs françaises acceptées : `27/10/2026`, `1 490,50 €`, `oui` / `non`,
  statuts en toutes lettres (« En formation », « Payée »…).
- Limites : 2 Mo et 5 000 lignes par fichier ; l'ancien format `.xls` est refusé.

Test d'intégration local : `BOS_TEST_DATABASE_URL=mysql://… npm test`
(**supprime les tables `bos_*` de la base indiquée** ; utiliser une base de test).

Ne jamais pointer ce dépôt sur la racine jamaliance.com.

## Sécurité

- `src/proxy.ts` protège `/app/*` et `/api/*` ; seules `/api/health` et
  `/api/auth/*` sont publiques. Session signée HMAC-SHA256, cookie `httpOnly`,
  `secure`, `SameSite=Lax`, 12 h. 5 échecs de connexion par IP → blocage 15 min.
- En-têtes HSTS, `X-Frame-Options: DENY`, `nosniff`, `noindex` sur tout le moteur.

## Agents IA

`POST /api/agents/run` `{ "agentId": "agt-005" }` : l'agent analyse les données du
cockpit avec Claude (`claude-opus-5-5` par défaut, `BOS_AGENTS_MODEL` pour changer)
et **propose** jusqu'à 3 actions. Rien n'est exécuté automatiquement. Les agents
« HITL obligatoire » ou à risque élevé envoient toujours leurs propositions dans la
file de validation humaine, quoi que réponde le modèle. Les e-mails des apprenants
ne sont pas transmis au modèle.

## API intégrations

- `GET /api/health` — sonde publique de déploiement
- `GET /api/integrations/status` — état Hostinger / TidyCal / agents IA (+ sonde live API)
- `GET /api/integrations/tidycal?view=public|bookings|types|timeslots`
- `POST /api/integrations/tidycal` — créer un créneau (types gratuits uniquement côté TidyCal)

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · Hostinger Node.js · MySQL / MariaDB · TidyCal API · API Claude
