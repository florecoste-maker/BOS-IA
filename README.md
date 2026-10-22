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
   | Dossier de sortie | `.next` |

4. Domaine : **bos.jamaliance.com** (sous-domaine ; jamaliance.com reste sur Horizons)
5. Variables d'environnement : copier celles de `.env.example`, avec
   `NEXT_PUBLIC_APP_URL=https://bos.jamaliance.com`.
   Les variables `NEXT_PUBLIC_*` sont figées **au build** : après les avoir
   modifiées, relancer un déploiement.
6. Optionnel : `TIDYCAL_API_TOKEN` pour l'API (l'embed public vit déjà sur le site Horizons)
7. Vérifier : `https://bos.jamaliance.com/api/integrations/status` répond en JSON.

`npm run build` exécute ensuite `scripts/prepare-standalone.mjs`, qui copie
`public/` et `.next/static/` dans `.next/standalone/` ; `npm start` lance
`node .next/standalone/server.js` (port lu dans `PORT`).

**Limite actuelle :** les données (sessions, OPCO, agents) sont des données de
démonstration en mémoire, réinitialisées à chaque redémarrage.

Ne jamais pointer ce dépôt sur la racine jamaliance.com.

## API intégrations

- `GET /api/integrations/status` — état Hostinger / TidyCal (+ sonde live API)
- `GET /api/integrations/tidycal?view=public|bookings|types|timeslots`
- `POST /api/integrations/tidycal` — créer un créneau (types gratuits uniquement côté TidyCal)

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · Hostinger Node.js · TidyCal API
