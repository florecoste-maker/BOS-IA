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
| Agents planifiés (analyse quotidienne) | ✅ Prêt (`BOS_CRON_SECRET` + base + clé Claude) |
| Envoi des e-mails approuvés (SMTP) | ✅ Prêt (`SMTP_*` requis, sinon envoi manuel) |
| Sauvegardes, alertes et bilan de santé | ✅ Prêt (`BOS_ALERTES_EMAIL` + SMTP + `BOS_CRON_SECRET`) |
| Comptes nominatifs et journal des actions | ✅ Prêt (base MySQL requise pour les conserver) |
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

Les indicateurs sont tous calculés à partir des données :
- **délai de paiement moyen** : jours entre émission et paiement, sur les factures
  payées des 12 derniers mois (colonne `payee_le` à l'import, ou bouton « Marquer
  payée » dans `/app/finance`) ; « — » tant qu'aucune facture payée n'est datée ;
- **MRR** : montant HT ramené au mois des factures d'abonnement (`recurrence` :
  mensuel, trimestriel, annuel) dont la période couvre aujourd'hui — une annuelle
  de 1 200 € compte 100 € pendant 12 mois ; brouillons exclus ; « — » sans abonnement ;
- jours de retard : depuis l'échéance, 0 pour une facture payée.

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

## Comptes et journal des actions

Chaque personne a son compte (e-mail + mot de passe, haché avec scrypt) :
- **membre** : travail courant (validations, finance, import, exports) ;
- **administrateur** : en plus, `/app/utilisateurs` (comptes) et `/app/journal`.

Premier démarrage : se connecter **sans e-mail** avec `BOS_ADMIN_PASSWORD` (compte
de secours), créer son compte administrateur dans « Comptes », puis se reconnecter
avec son e-mail. Le compte de secours reste utilisable en dernier recours ; chaque
usage est journalisé et signalé par alerte ; `BOS_SECOURS_DESACTIVE=1` le coupe.

Garde-fous : impossible de désactiver ou de rétrograder son propre compte, ou le
dernier administrateur actif ; un compte désactivé perd l'accès à sa requête
suivante (le compte est relu en base à chaque requête, et le rôle vient de la base,
pas du jeton) ; 5 échecs de connexion par adresse IP ou par compte → 15 min de blocage.

Le journal enregistre qui, quoi, quand et l'adresse IP : connexions (réussies,
refusées, de secours), décisions sur les propositions des agents (l'auteur s'affiche
aussi dans « Décisions récentes »), envois et renvois d'e-mails, analyses lancées,
imports, exports, paiements, dossiers, actions sur les apprenants, gestion des
comptes. Export CSV pour Qualiopi / RGPD (cellules protégées contre l'injection de
formules Excel).

## Sécurité

- `src/proxy.ts` protège `/app/*` et `/api/*` ; seules `/api/health`,
  `/api/auth/*`, `/api/agents/planifie` et `/api/sauvegarde` (protégées par leur
  propre secret) sont publiques. Session signée HMAC-SHA256, cookie `httpOnly`,
  `secure`, `SameSite=Lax`, 12 h. 5 échecs de connexion par IP → blocage 15 min.
- En-têtes HSTS, `X-Frame-Options: DENY`, `nosniff`, `noindex` sur tout le moteur.

## Agents IA

`POST /api/agents/run` `{ "agentId": "agt-005" }` : l'agent analyse les données du
cockpit avec Claude (`claude-opus-5-5` par défaut, `BOS_AGENTS_MODEL` pour changer)
et **propose** jusqu'à 3 actions. Rien n'est exécuté automatiquement. Les agents
« HITL obligatoire » ou à risque élevé envoient toujours leurs propositions dans la
file de validation humaine, quoi que réponde le modèle. Les e-mails des apprenants
ne sont pas transmis au modèle.

## Exécution des actions approuvées

Quand une action consiste à écrire à un apprenant ou au client d'une facture, l'agent
joint un **brouillon d'e-mail**. Dans la file HITL (`/app/agents`), le brouillon
s'affiche avec son destinataire ; objet et texte sont modifiables, puis
**« Approuver et envoyer »** l'envoie par SMTP. Les autres actions restent « à
réaliser par l'équipe ».

Garde-fous :
- le modèle ne fournit jamais d'adresse : il désigne un apprenant ou une facture par
  son id, l'adresse est lue en base (e-mail de l'apprenant, `email_client` de la
  facture) ; un id inconnu ou une facture sans adresse écarte le brouillon ;
- les adresses ne sont pas transmises au modèle ;
- tout brouillon passe par la validation humaine, quel que soit l'agent ;
- une décision ne se prend qu'une fois : pas de double envoi sur double clic ;
- en mode démonstration, l'envoi est simulé ; sans SMTP, l'e-mail est marqué « à
  envoyer » (avec l'adresse) ; un échec SMTP est affiché, avec « Renvoyer » ;
- `BOS_EMAIL_REDIRECTION` (mode test) envoie tout vers votre adresse, le
  destinataire prévu étant indiqué dans l'objet.

Configuration (hPanel) : `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`,
`SMTP_FROM` — voir `.env.example` pour Google Workspace et la messagerie Hostinger.
`/app/integrations` → carte « E-mails (SMTP) » vérifie la connexion. Pour les
relances de factures, importer les factures avec la colonne `email_client`.

## Sauvegardes et alertes

**Exports** (`/app/import` → « Exporter et sauvegarder », session requise) :
sauvegarde complète JSON, et un CSV par type **au format exact de l'import**.
Restauration : réimporter ces CSV dans l'ordre sessions → apprenants → dossiers →
factures (testé : base vidée puis restaurée, indicateurs identiques).

**Alertes** — `BOS_ALERTES_EMAIL` reçoit, par le SMTP configuré :
- un rapport après chaque passage planifié, seulement s'il y a des échecs ou des
  propositions en attente de validation ;
- une alerte immédiate quand un e-mail approuvé ne part pas ;
- chaque dimanche, la sauvegarde complète en pièce jointe (`.json.gz`).

**Surveillance** — workflow GitHub « Surveillance » (même secret `BOS_CRON_SECRET`) :
bilan de santé quotidien `GET /api/health?complet=1` (base, Claude, SMTP,
dernier passage planifié, alertes) et sauvegarde hebdomadaire `POST /api/sauvegarde`.
Un service en erreur fait échouer le workflow et **GitHub prévient le propriétaire
du dépôt par e-mail** — y compris quand le site ne peut plus rien envoyer.

Hostinger sauvegarde aussi les bases MySQL (hPanel → Sauvegardes) : vérifier la
fréquence incluse dans l'offre.

## Agents planifiés

Chaque jour ouvré, les agents analysent le cockpit sans clic. Un planificateur
externe appelle `POST /api/agents/planifie` avec le secret `BOS_CRON_SECRET` ; la
route répond tout de suite (202) et les analyses tournent en arrière-plan.

Garde-fous côté serveur :
- verrou MySQL : deux appels simultanés ne lancent rien en double ;
- intervalle minimal de 20 h par agent (`BOS_AGENTS_INTERVALLE_HEURES`) ;
- un agent dont des propositions attendent une validation humaine n'est pas
  relancé (la file HITL ne s'empile pas) ; un agent en pause est ignoré ;
- les propositions suivent les règles habituelles : rien n'est exécuté sans validation.

Chaque exécution (manuelle ou planifiée, succès ou échec) est journalisée et visible
dans `/app/agents` → « Exécutions ». `/app/integrations` montre l'état et le dernier
passage.

Mise en place :
1. Générer un secret : `openssl rand -hex 32`.
2. hPanel → variables de la Web App : `BOS_CRON_SECRET=<secret>` (la base MySQL et
   `ANTHROPIC_API_KEY` doivent déjà être configurées), puis redémarrer.
3. GitHub → dépôt déployé → Settings → Secrets and variables → Actions → secret
   `BOS_CRON_SECRET` (même valeur). Le workflow « Agents planifiés » tourne du lundi
   au vendredi à 06:17 UTC ; « Run workflow » le lance à la demande.
   GitHub suspend les workflows planifiés après 60 jours sans activité sur le dépôt :
   le réactiver dans l'onglet Actions si besoin.
4. Alternative ou complément : une tâche cron (hPanel → Avancé → Tâches cron, si
   l'offre le permet) :
   `curl -s -X POST -H "Authorization: Bearer <secret>" https://app.jamaliance.com/api/agents/planifie`

`?attendre=1` attend la fin des analyses et renvoie le résultat de chaque agent
(utile pour tester ; peut dépasser le délai du proxy Hostinger).

## API intégrations

- `GET /api/health` — sonde publique de déploiement
- `POST /api/agents/planifie` — déclencheur des agents planifiés (secret `BOS_CRON_SECRET`)
- `GET /api/health?complet=1` — bilan de santé (secret `BOS_CRON_SECRET`)
- `POST /api/sauvegarde` — sauvegarde par e-mail (secret `BOS_CRON_SECRET`)
- `GET /api/export?format=json|csv&type=…` — exports (session)
- `GET /api/integrations/status` — état Hostinger / TidyCal / agents IA (+ sonde live API)
- `GET /api/integrations/tidycal?view=public|bookings|types|timeslots`
- `POST /api/integrations/tidycal` — créer un créneau (types gratuits uniquement côté TidyCal)

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · Hostinger Node.js · MySQL / MariaDB · TidyCal API · API Claude
