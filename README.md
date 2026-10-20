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
npm run build
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

1. hPanel → **Sites web** → **Créer un site** → **Web App / Node.js**
2. Importer le dépôt GitHub `BOS-IA` (branche fusionnée)
3. Preset `next`, build `npm run build`, output `.next`, Node 20 ou 22
4. Domaine / sous-domaine : **bos.jamaliance.com** (laisser jamaliance.com sur Horizons)
5. Coller les variables de `.env.example` (dont `NEXT_PUBLIC_APP_URL=https://bos.jamaliance.com`)
6. Optionnel : `TIDYCAL_API_TOKEN` pour l'API (l'embed public vit déjà sur le site Horizons)

Ne jamais pointer ce dépôt sur la racine jamaliance.com.

## API intégrations

- `GET /api/integrations/status` — état Hostinger / TidyCal (+ sonde live API)
- `GET /api/integrations/tidycal?view=public|bookings|types|timeslots`
- `POST /api/integrations/tidycal` — créer un créneau (types gratuits uniquement côté TidyCal)

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · Hostinger Node.js · TidyCal API
