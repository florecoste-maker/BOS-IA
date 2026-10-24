# Jamaliance · BOS-IA

**BOS-IA** est le moteur opérationnel de l'agence **Jamaliance** — pas un second site vitrine.

| Couche | URL | Hébergement |
|--------|-----|-------------|
| Vitrine publique | [jamaliance.com](https://jamaliance.com) | Hostinger Horizons (**ne pas remplacer**) |
| Moteur BOS-IA | [bos.jamaliance.com](https://bos.jamaliance.com) | Hostinger Web App Node.js (à déployer) |
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
| CI GitHub (lint, tests, build) | ✅ Prêt |
| Config Hostinger `standalone` + `.env.example` | ✅ Prêt |
| Déploiement sur `bos.jamaliance.com` | ⏳ Manuel — après confirmation |

## Démarrage local

```bash
cp .env.example .env.local   # valeurs d'exemple déjà alignées Jamaliance
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
| `/app/integrations` | État Hostinger / TidyCal (+ aperçu calendrier) |

## Déploiement Hostinger (bos.jamaliance.com)

**Prérequis plan :** Business ou Cloud avec *Web Apps Node.js*.

1. hPanel → **Sites web** → **Ajouter un site** → **Web App Node.js**
2. Source : **GitHub** → dépôt `florecoste-maker/BOS-IA`, branche `main`
3. Réglages de build :

   | Champ | Valeur |
   |-------|--------|
   | Framework | Next.js |
   | Version Node | 22 (minimum 20.9) |
   | Commande d'installation | `npm ci` |
   | Commande de build | `npm run build` |
   | Commande de démarrage | `npm start` |
   | Fichier d'entrée (si demandé) | `server.js` |
   | Dossier de sortie | `.next` |

   Le serveur de build Hostinger a une glibc trop ancienne pour le binaire
   natif SWC de Next 16 (`GLIBC_2.29 not found`). D'où :
   - `next.config.mjs` (pas de `.ts` : la config se lit sans SWC) ;
   - `npm run build` = `next build --webpack` (Turbopack n'existe qu'en natif) ;
   - `@next/swc-wasm-nodejs` installé : Next bascule automatiquement sur SWC
     WebAssembly quand le binaire natif ne se charge pas.

   Les outils nécessaires au build (TypeScript, Tailwind) sont dans
   `dependencies` : le build fonctionne même si Hostinger installe en mode
   production (`NODE_ENV=production`).

4. Domaine : **bos.jamaliance.com** (sous-domaine ; jamaliance.com reste sur Horizons)
5. Variables d'environnement : copier celles de `.env.example`, avec
   `NEXT_PUBLIC_APP_URL=https://bos.jamaliance.com`.
   Les variables `NEXT_PUBLIC_*` sont figées **au build** : après les avoir
   modifiées, relancer un déploiement.
6. Optionnel : `TIDYCAL_API_TOKEN` pour l'API (l'embed public vit déjà sur le site Horizons)
   **Obligatoires** pour ouvrir le cockpit : `BOS_ADMIN_PASSWORD` (12 caractères
   minimum) et `BOS_SESSION_SECRET` (32 caractères minimum, `openssl rand -hex 32`).
   Sans elles, `/app` et `/api` restent fermés.
7. Agents IA : `ANTHROPIC_API_KEY` (console.anthropic.com → API Keys).
8. Vérifier : `https://bos.jamaliance.com/api/health` répond `{"ok":true}`, puis se
   connecter sur `https://bos.jamaliance.com/login`.

`npm run build` exécute ensuite `scripts/prepare-standalone.mjs`, qui copie
`public/` et `.next/static/` dans `.next/standalone/` ; `npm start` lance
`node server.js`, qui démarre `.next/standalone/server.js` sur `0.0.0.0` (port lu
dans `PORT`). L'écoute ne dépend donc pas de la variable système `HOSTNAME`.

**Limite actuelle :** les données (sessions, OPCO, agents, propositions des agents)
sont des données de démonstration en mémoire, réinitialisées à chaque redémarrage.

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

Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · Hostinger Node.js · TidyCal API · API Claude
