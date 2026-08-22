# BOS-IA

Système d'exploitation cognitif pour PME — plateforme unifiée **LMS Audit-Ready** + **ERP OPCO-Ready** + **Digital Nexus**.

## Vision

BOS-IA transforme une PME / organisme de formation en organisation augmentée :

- **System of Record (SoR)** — données critiques isolées par tenant, hébergées en Europe (RGPD)
- **System of Engagement (SoE)** — cockpit métier, assistants IA, workflows Proof-to-Cash
- **Pilier 1** — formation Qualiopi, pipeline cognitif, anti ghost learner
- **Pilier 2** — dossiers OPCO, facturation 30/70, recouvrement sous HITL
- **Digital Nexus** — SMA hiérarchisé (QAA / IPOA / FCA-MDGA) conforme AI Act

## Démarrage

```bash
npm install
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000).

```bash
npm run build   # production
npm test        # SoR / Proof-to-Cash / HITL
npm run lint
```

## Parcours applicatif

| Route | Module |
|-------|--------|
| `/` | Landing vision |
| `/app` | Cockpit de pilotage |
| `/app/formation` | Pipeline cognitif & apprenants |
| `/app/finance` | Dossiers OPCO & factures |
| `/app/agents` | Supervision multi-agents + HITL |

## API (SoR)

- `GET /api/dashboard`
- `GET|PATCH /api/formation` — valider quiz, relancer ghost learner, Proof-to-Cash
- `GET|PATCH /api/finance` — compléter / transmettre dossier OPCO
- `GET|PATCH /api/agents` — approuver / refuser actions HITL

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind CSS 4
