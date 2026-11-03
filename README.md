# Jamaliance · BOS-IA

**BOS-IA** est le moteur opérationnel de l'agence **Jamaliance** — pas un second site vitrine.

| Couche | URL | Hébergement |
|--------|-----|-------------|
| Vitrine publique | [jamaliance.com](https://jamaliance.com) | Hostinger Horizons (**ne pas remplacer**) |
| Moteur BOS-IA (cockpit : [app.jamaliance.com/app](https://app.jamaliance.com/app)) | [app.jamaliance.com](https://app.jamaliance.com) | Hostinger Web App Node.js, reconstruite à chaque fusion sur `main` |
| Rendez-vous clients | [jamaliance.com/reservation](https://jamaliance.com/reservation) | Horizons + TidyCal (déjà en ligne) |

`bos.jamaliance.com` est une **ancienne adresse abandonnée** (site Hostinger qui ne
se met plus à jour) : elle n'est plus jamais affichée, même si `NEXT_PUBLIC_APP_URL`
la désigne encore dans hPanel (`cockpitBaseUrl()` dans `src/lib/brand.ts`), et toute
visite y est redirigée (307, réversible) vers `app.jamaliance.com` — l'accueil vers
`/app` (`redirects()` dans `next.config.mjs`). La redirection prend effet sur ce site
après un seul redéploiement dans hPanel (il ne se reconstruit pas automatiquement).

## Ce qui existe déjà

| Élément | État |
|--------|------|
| App Next.js BOS-IA (clients, contacts, missions, devis, factures, paiements, agents IA avec validation humaine) | ✅ Présent |
| Espaces séparés par entreprise cliente + comptes clients (`/espace`) | ✅ Prêt |
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
| `/app/clients` | Entreprises clientes, contacts et missions |
| `/app/devis` | Devis par lignes, transformés en facture une fois acceptés |
| `/app/finance` | Factures et paiements |
| `/app/agents` | Supervision multi-agents + HITL |
| `/app/import` | Import CSV / Excel des données |
| `/app/integrations` | État Hostinger / TidyCal (+ aperçu calendrier) |
| `/espace` | Espace d'une entreprise cliente (comptes clients uniquement) |

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
4. **Accès au cockpit : workflow « Installation du cockpit »** (aucune saisie
   dans le gestionnaire de fichiers). Hostinger lance l'application par
   LiteSpeed (`lsnode.js`) depuis un dossier recréé à chaque déploiement
   (`domains/<domaine>/hbuilds/versions/<id>/nodejs`) et le processus ne reçoit
   pas les variables saisies dans hPanel. Les réglages vivent donc dans
   `~/bos-ia.env`, à la racine du compte (hors de tout dossier public), qui
   survit aux déploiements :
   - `BOS_SESSION_SECRET` : généré par le serveur au premier démarrage
     (`~/bos-ia-session.key`), jamais saisi ni affiché ;
   - `BOS_ADMIN_PASSWORD` : GitHub → dépôt privé **BOS-IA-Hostinger** →
     Actions → **Installation du cockpit** → *Run workflow*. Le résumé de
     l'exécution donne un lien `/installation?code=…` à usage unique, où l'on
     choisit le mot de passe (12 caractères minimum) ; il est écrit dans
     `~/bos-ia.env` et l'on entre directement dans le cockpit ;
   - le même workflow recopie dans `~/bos-ia.env` les secrets du dépôt
     (`BOS_CRON_SECRET`, `ANTHROPIC_API_KEY`, `DB_*`, `SMTP_*`, `TIDYCAL_*`) :
     ajouter ou changer un secret dans GitHub, puis relancer le workflow
     (redémarrer l'application si une valeur déjà connue a changé).

   Le serveur n'accepte que ce workflow, sur `main`, dans ce dépôt privé
   (jeton OIDC signé par GitHub, aucun secret partagé ; autre dépôt :
   `BOS_INSTALLATION_DEPOT`). Secours sans GitHub : le code est aussi dans
   `~/bos-ia-installation.txt` tant que l'installation n'est pas faite. On peut
   toujours écrire `bos-ia.env` à la main (`NOM=valeur`, une variable par
   ligne).

   **Priorité des réglages** : variable réellement fournie au processus >
   `~/bos-ia.env` > copie faite au build (`.next/standalone/.env.production.local`,
   variables hPanel). Un ancien `BOS_ADMIN_PASSWORD` resté dans hPanel ne
   remplace donc plus le mot de passe choisi par le lien d'installation ou de
   réinitialisation. `/api/health?diagnostic=1` → `mot_de_passe_secours.source`
   indique d'où vient le mot de passe utilisé (jamais sa valeur). `/api/health?diagnostic=1` indique quels fichiers sont chargés et
   quelles variables le processus voit (noms seulement). Sans mot de passe
   administrateur, `/app` et `/api` restent fermés.
5. Les URLs ont des valeurs Jamaliance par défaut (`https://jamaliance.com`,
   `https://app.jamaliance.com`, calendrier TidyCal de jamaliance.com/reservation) ;
   les variables `NEXT_PUBLIC_*` de `.env.example` ne servent qu'à les changer et
   sont figées **au build** : après modification, redéployer.
6. Agents IA : `ANTHROPIC_API_KEY` (console.anthropic.com → API Keys).
7. Base de données, e-mails, alertes : **cockpit → Connexions → « Réglages du
   serveur »** (administrateurs). On y colle les valeurs de hPanel ; chaque
   connexion est testée avant d'être écrite dans `~/bos-ia.env`, un échec ne
   change rien. Aucun secret GitHub ni fichier à éditer (voir aussi « Base de
   données » ci-dessous).
8. Optionnel : `TIDYCAL_API_TOKEN` pour l'API (l'embed public vit déjà sur le site Horizons)
9. Vérifier : `https://app.jamaliance.com/api/health` répond `{"ok":true}`, puis se
   connecter sur `https://app.jamaliance.com/login`.

`npm run build` exécute ensuite `scripts/prepare-standalone.mjs`, qui copie
`public/` et `.next/static/` dans `.next/standalone/` ; `npm start` lance
`node server.js`, qui démarre `.next/standalone/server.js` sur `0.0.0.0` (port lu
dans `PORT`). L'écoute ne dépend donc pas de la variable système `HOSTNAME`.

## Déploiement Vercel (bos-ia.vercel.app)

Projet Vercel `bos-ia`, relié au dépôt public `florecoste-maker/BOS-IA`, branche
`main` (déploiement automatique à chaque fusion). Seule l'adresse de production
`https://bos-ia.vercel.app` est publique ; les préversions sont protégées par
l'authentification Vercel.

Vercel transmet ses variables à l'application. Dans Vercel → projet **bos-ia** →
**Settings → Environment Variables** (environnement *Production*), puis
**Deployments → Redeploy** :
- `BOS_ADMIN_PASSWORD` (12 caractères minimum) : **seule variable obligatoire**.
  Sans `BOS_SESSION_SECRET`, le secret de session en est dérivé (scrypt) ;
  changer le mot de passe ferme les sessions ouvertes ;
- `ANTHROPIC_API_KEY` : agents IA ;
- optionnels : `BOS_SESSION_SECRET`, `DB_*`, `SMTP_*`, `BOS_CRON_SECRET`.

Sans base MySQL, Vercel tourne en mode démonstration (données en mémoire, propres
à chaque instance et réinitialisées). La page `/installation` et le fichier
`bos-ia.env` ne servent que sur Hostinger.

## Base de données

Sans base configurée, le cockpit tourne en **mode démonstration** : données fictives
en mémoire, réinitialisées à chaque redémarrage, signalées par un bandeau.

Pour les données réelles (MySQL ou MariaDB Hostinger) :

1. hPanel → **Bases de données** → **Gestion** : créer une base et un utilisateur
   (Hostinger préfixe les noms, par ex. `u123456789_bosia`).
2. Cockpit → `/app/integrations` → **Réglages du serveur** → « Base de données » :
   nom de la base, utilisateur, mot de passe → **Tester et enregistrer**. La
   connexion est testée (`localhost` puis `127.0.0.1`) ; en cas de succès les
   réglages sont écrits dans `~/bos-ia.env` et le cockpit bascule aussitôt sur
   MySQL, sans redémarrage. (Autres voies : secrets `DB_*` du dépôt + workflow
   « Installation du cockpit », ou `DATABASE_URL` à la main.)
3. Les tables `bos_*` sont créées et les 6 agents enregistrés au premier accès.
   **Aucune donnée fictive** n'est insérée.
4. Vérifier `/app/integrations` → carte « Base de données » : « MySQL connecté ».

Les indicateurs sont tous calculés à partir des données :
- **clients actifs / prospects**, **missions en cours** et **carnet de commandes**
  (missions signées, en cours ou livrées, HT) ;
- **à encaisser** : reste dû TTC des factures émises (brouillons et factures
  annulées exclus) ; **encaissé ce mois-ci** : paiements reçus depuis le 1er ;
- **délai de paiement moyen** : jours entre émission et paiement complet, sur les
  factures soldées des 12 derniers mois ; « — » tant qu'aucune ne l'est ;
- **MRR** : montant HT ramené au mois des factures d'abonnement (`recurrence` :
  mensuel, trimestriel, annuel) dont la période couvre aujourd'hui — une annuelle
  de 1 200 € compte 100 € pendant 12 mois ; brouillons et annulées exclus ;
- jours de retard : depuis l'échéance, 0 pour une facture payée, annulée ou en brouillon.

## Clients, missions, factures et paiements

Tout se saisit dans le cockpit (aucun import nécessaire). Modes de paiement :
virement, Stripe, PayPal, carte, prélèvement, chèque, espèces ; le paiement en ligne
(Stripe, PayPal) sera branché plus tard, les règlements s'enregistrent à la main :
- **Clients** (`/app/clients`) : entreprise, contact principal, e-mail, téléphone,
  secteur, source, notes ; statut prospect, actif, inactif ou perdu. L'e-mail du
  contact sert aux e-mails approuvés et aux relances de factures.
- **Missions** (depuis la fiche client) : agent IA, automatisation, conseil /
  accompagnement, abonnement ; montant HT, dates ; code `MIS-AAAA-NNNN` automatique.
- **Factures** (`/app/finance`) : client, mission éventuelle, objet, montant HT, TVA
  (20 % par défaut, 0 en franchise), échéance, abonnement ; numéro `FA-AAAA-NNNN`
  automatique ou celui de votre logiciel de facturation. BOS-IA suit les factures, il
  ne produit pas le PDF légal.
- **Paiements** : montant TTC reçu, date, mode (virement, carte, prélèvement, chèque,
  espèces, Stripe, PayPal…), référence. Un premier versement passe la facture en
  « partiellement payée », le versement qui la solde en « payée » (date de solde
  enregistrée). Jamais plus que le reste dû ; deux saisies simultanées ne
  dépassent pas le montant (facture verrouillée). Une facture payée ne change plus
  de statut ; « payée » ne se choisit jamais à la main.

## Espaces clients et comptes clients

Chaque entreprise cliente a son **espace** : contacts, missions, devis, factures et
paiements. L'équipe Jamaliance (administrateurs, membres) voit tous les espaces
dans le cockpit ; un **compte client** ne voit que celui de son entreprise.

- Création : `/app/utilisateurs` → rôle « Client », entreprise choisie une fois pour
  toutes (un compte client ne devient jamais un compte de l'équipe, ni l'inverse).
- Connexion sur la même page `/login` ; un compte client arrive sur `/espace` et ne
  peut ouvrir que `/espace`, `/api/espace` et `/api/compte` (son mot de passe).
  Tout le reste répond 403 ou renvoie vers `/espace` (`src/lib/access.ts`, appliqué
  par `src/proxy.ts`, revérifié dans les pages).
- L'entreprise vient du compte, relu en base à chaque requête — jamais d'un paramètre :
  `/api/espace?clientId=…` est ignoré. Les requêtes de l'espace filtrent sur
  `client_id` (`Repository.getSpace`).
- L'espace n'affiche ni notes internes, ni source, ni statut commercial, ni
  brouillons (devis, factures), ni références bancaires (`src/lib/espace.ts`).
- Contacts : interlocuteurs chez le client (un seul « principal ») et contacts de
  ce client (ses clients, prospects, fournisseurs) pour ses futurs agents IA.

## Devis

Lignes (désignation, quantité, prix unitaire HT), TVA, date de validité (30 jours
par défaut) ; numéro `DEV-AAAA-NNNN`. Statuts : brouillon (invisible pour le client),
envoyé, accepté, refusé ; « expiré » se déduit de la date. Dans son espace, le client
**accepte ou refuse** un devis envoyé et encore valable (confirmation avec le montant,
une seule réponse, nom et date conservés, inscrit au journal ; l'équipe est prévenue
par e-mail via `BOS_ALERTES_EMAIL`). « Créer la facture »
transforme un devis accepté en facture émise (échéance 30 jours), une seule fois,
même sur double clic. Un devis facturé est verrouillé. Les devis figurent dans la
sauvegarde JSON (pas d'import CSV).

## Import CSV / Excel

`/app/import` charge les clients, missions, factures et paiements depuis un fichier
`.xlsx` (première feuille) ou CSV (séparateur `;`, `,` ou tabulation ; UTF-8 ou
Windows-1252, comme les CSV d'Excel en français). Un modèle par type est
téléchargeable sur la page. Facultatif : tout se saisit aussi dans le cockpit.

- Ordre : clients → missions → factures → paiements (références par nom du client,
  code de mission, numéro de facture).
- **Vérifier** affiche toutes les erreurs ligne par ligne sans rien écrire ;
  **Importer** écrit tout ou rien, dans une transaction.
- Une ligne existante (même nom de client, code ou numéro) est mise à jour ; une
  cellule vide conserve la valeur enregistrée.
- Valeurs françaises acceptées : `27/10/2026`, `1 490,50 €`, `5,5 %`, statuts et
  modes en toutes lettres (« Prospect », « Partiellement payée », « Carte bancaire »…).
- Les paiements importés recalculent le statut de leur facture.
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
imports, exports, fiches clients, missions, factures, paiements, gestion des
comptes. Export CSV pour la comptabilité / RGPD (cellules protégées contre l'injection de
formules Excel).

## Sécurité

- `src/proxy.ts` protège `/app/*` et `/api/*` ; seules `/api/health`,
  `/api/auth/*`, `/api/agents/planifie` et `/api/sauvegarde` (protégées par leur
  propre secret) sont publiques. Session signée HMAC-SHA256, cookie `httpOnly`,
  `secure`, `SameSite=Lax`, 12 h. 5 échecs de connexion par IP → blocage 15 min.
- En-têtes HSTS, `X-Frame-Options: DENY`, `nosniff`, `noindex` sur tout le moteur.

## Agents IA

`POST /api/agents/run` `{ "agentId": "agt-003" }` : l'agent analyse les données du
cockpit avec Claude (`claude-opus-5-5` par défaut, `BOS_AGENTS_MODEL` pour changer)
et **propose** jusqu'à 3 actions. Rien n'est exécuté automatiquement. Les agents
« HITL obligatoire » ou à risque élevé envoient toujours leurs propositions dans la
file de validation humaine, quoi que réponde le modèle. Les adresses e-mail,
téléphones et références bancaires ne sont pas transmis au modèle.

| Agent | Rôle | Validation humaine |
| --- | --- | --- |
| `agt-001` Suivi commercial | Relance des prospects et des clients sans nouvelles | Toujours |
| `agt-002` Suivi des missions | Échéances, livraisons, avancement | Pour e-mails et statuts |
| `agt-003` Recouvrement assisté | Relances des factures échues (risque élevé) | Toujours |
| `agt-004` Pilotage financier | Trésorerie, encaissements, abonnements | Pour e-mails et statuts |
| `agt-005` Conformité RGPD | Données clients minimales, conservation | Pour e-mails et statuts |
| `agt-006` Assistant e-mails | Rédaction des e-mails aux clients | Toujours |

## Exécution des actions approuvées

Quand une action consiste à écrire à un client ou au client d'une facture, l'agent
joint un **brouillon d'e-mail**. Dans la file HITL (`/app/agents`), le brouillon
s'affiche avec son destinataire ; objet et texte sont modifiables, puis
**« Approuver et envoyer »** l'envoie par SMTP. Les autres actions restent « à
réaliser par l'équipe ».

Garde-fous :
- le modèle ne fournit jamais d'adresse : il désigne un client ou une facture par
  son id, l'adresse est lue en base (e-mail du contact sur la fiche client) ; un id
  inconnu ou un client sans adresse écarte le brouillon ;
- les adresses ne sont pas transmises au modèle ;
- tout brouillon passe par la validation humaine, quel que soit l'agent ;
- une décision ne se prend qu'une fois : pas de double envoi sur double clic ;
- en mode démonstration, l'envoi est simulé ; sans SMTP, l'e-mail est marqué « à
  envoyer » (avec l'adresse) ; un échec SMTP est affiché, avec « Réessayer » ;
- `BOS_EMAIL_REDIRECTION` (mode test) envoie tout vers votre adresse, le
  destinataire prévu étant indiqué dans l'objet.

### Configurer l'envoi (SMTP)

Le plus simple : `/app/integrations` → **Réglages du serveur** → « Envoi des
e-mails » (Hostinger, Google ou autre serveur ; connexion testée avant
enregistrement, mode test proposé). Équivalent en variables :

| Variable | Messagerie Hostinger | Google Workspace |
| --- | --- | --- |
| `SMTP_HOST` | `smtp.hostinger.com` | `smtp.gmail.com` |
| `SMTP_PORT` | `465` | `587` |
| `SMTP_USER` | `contact@jamaliance.com` (adresse complète) | `contact@jamaliance.com` |
| `SMTP_PASSWORD` | mot de passe de la boîte | mot de passe d'application (16 lettres) |
| `SMTP_FROM` | `Jamaliance <contact@jamaliance.com>` | idem |
| `BOS_EMAIL_REDIRECTION` | votre adresse, pendant les essais | idem |

`SMTP_SECURE` est déduit du port (465 → chiffré d'emblée, 587 → STARTTLS) ;
ne le renseigner que pour un serveur atypique. Google : mot de passe d'application
via Compte Google → Sécurité → Validation en deux étapes → Mots de passe des
applications. L'adresse de `SMTP_FROM` doit appartenir au compte `SMTP_USER`
(sinon refus ou spam).

Vérification (`/app/integrations`, carte « E-mails (SMTP) ») : connexion et
identifiants testés à l'ouverture, erreurs de réglage signalées (port et
chiffrement incohérents, expéditeur d'un autre domaine, mot de passe vide), et
bouton « Envoyer le test » (administrateurs, inscrit au journal) qui envoie un
vrai message à l'adresse choisie. S'il arrive en spam : vérifier SPF et DKIM du
domaine (hPanel → Domaines → DNS). Une fois les essais concluants, vider
`BOS_EMAIL_REDIRECTION` pour que les e-mails approuvés partent aux vrais
destinataires. Pour les relances de factures, renseigner l'e-mail du contact sur la
fiche client.

### Changements de statut

Les agents peuvent aussi proposer de changer un statut, appliqué en base après
approbation (seul ou avec un e-mail : « relancer et passer en relance ») :

| Opération | Valeurs proposables |
| --- | --- |
| Statut d'un client | prospect, actif, inactif, perdu |
| Statut d'une mission | en cours, livrée, terminée |
| Statut d'une facture | émise, relance, impayée |

La carte affiche la fiche visée et son statut actuel ; la valeur reste modifiable
dans la liste avant d'approuver. Les gestes qui engagent l'agence restent humains :
« payée » (via un paiement), mission « signée » ou « annulée », facture « annulée »
ne sont jamais proposables, et une valeur hors liste est ignorée, même modifiée à la main.
Fiche inconnue → proposition écartée ; fiche supprimée entre-temps → « Échec », et
l'e-mail associé n'est pas envoyé. Chaque application est inscrite au journal.

## Sauvegardes et alertes

**Exports** (`/app/import` → « Exporter et sauvegarder », session requise) :
sauvegarde complète JSON, et un CSV par type **au format exact de l'import**.
Restauration : réimporter ces CSV dans l'ordre clients → missions → factures →
paiements (tests automatiques : chaque export se relit sans erreur à l'import).

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
Même sans secret, le workflow vérifie la sonde publique `GET /api/health` : le
site répond et c'est bien BOS-IA (et non une page Hostinger par défaut). Un secret
de valeur différente de hPanel est signalé (« Secret refusé »). Lancement à la
main : onglet Actions → Surveillance → Run workflow.

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
