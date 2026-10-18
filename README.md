# Jamaliance · BOS-IA

Assistant opérationnel de l'agence **Jamaliance** — cockpit BOS-IA (formation, finance, agents IA) connecté au site **Hostinger** et à la prise de rendez-vous **TidyCal**.

Site public agence : [jamaliance.com](https://jamaliance.com)

## Ce qui existe déjà

| Élément | État |
|--------|------|
| App Next.js BOS-IA (LMS, ERP OPCO, Digital Nexus HITL) | ✅ Présent |
| Branding **Jamaliance** (landing, nav, metadata) | ✅ Préparé dans ce dépôt |
| Page `/rendez-vous` + embed TidyCal | ✅ Prêt (nécessite URL publique) |
| API TidyCal (`/api/integrations/tidycal`) | ✅ Prêt (nécessite jeton API) |
| Statut connexions (`/app/integrations`) | ✅ Prêt |
| Déploiement Hostinger Node.js | ⚙️ Config code prête — déploiement manuel |

## Démarrage local

```bash
cp .env.example .env.local   # puis renseigner vos valeurs
npm install
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000).

```bash
npm run build
npm test
npm run lint
```

## Parcours

| Route | Rôle |
|-------|------|
| `/` | Landing Jamaliance |
| `/rendez-vous` | Calendrier TidyCal (embed) |
| `/app` | Cockpit BOS-IA |
| `/app/formation` | Pipeline formation |
| `/app/finance` | Dossiers OPCO & factures |
| `/app/agents` | Supervision multi-agents + HITL |
| `/app/integrations` | État Hostinger / TidyCal |

## Automatique vs votre intervention

### Fait automatiquement dans le code

- Renommage / positionnement **Jamaliance** + produit **BOS-IA**
- Page rendez-vous et panneau de statut des connexions
- Client + routes API TidyCal (liste RDV, types, créneaux, création)
- `output: "standalone"` pour Hostinger / VPS
- `.env.example` documentant toutes les variables

### Nécessite votre intervention

1. **TidyCal**
   - Compte + plan permettant l'API (Individual / Pro / Agency)
   - Lien public de booking → `NEXT_PUBLIC_TIDYCAL_URL`
   - Personal token → `TIDYCAL_API_TOKEN` ([créer ici](https://tidycal.com/integrations/advanced))
   - ID du type de RDV → `TIDYCAL_BOOKING_TYPE_ID` (optionnel pour l'embed seul)

2. **Hostinger**
   - Plan **Business** ou **Cloud** avec Web Apps Node.js (ou VPS)
   - Dans hPanel : *Websites → Add Website → Node.js* → importer ce dépôt GitHub
   - Préset `next`, build `npm run build`, output `.next`, Node 20/22
   - Coller les variables d'environnement (voir `.env.example`)
   - Pointer le domaine / sous-domaine (ex. app.jamaliance.com) vers l'app
   - Le site vitrine [jamaliance.com](https://jamaliance.com) peut rester tel quel ; BOS-IA se déploie en complément

3. **Secrets**
   - Ne jamais committer `.env.local` ni le jeton TidyCal

## API intégrations

- `GET /api/integrations/status` — état Hostinger / TidyCal (+ sonde live API)
- `GET /api/integrations/tidycal?view=public|bookings|types|timeslots`
- `POST /api/integrations/tidycal` — créer un créneau (types gratuits uniquement côté TidyCal)

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · Hostinger Node.js · TidyCal API
