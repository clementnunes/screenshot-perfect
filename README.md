# Orvane Recrutement

Plateforme de gestion et de pré-qualification intelligente des candidatures, combinant un tableau de bord recruteur sécurisé, un portail candidat dédié aux pré-entretiens et une orchestration de workflows IA déléguée à n8n.

---

## 📌 Présentation

Orvane Recrutement modernise le processus de recrutement :
- **Recruteurs** : Importez des CV (à l'unité ou en masse), déclenchez l'analyse automatisée, évaluez la correspondance avec la fiche de poste, invitez à un pré-entretien ou planifiez un rendez-vous.
- **Candidats** : Déposez votre CV en ligne ou accédez à un espace de pré-entretien interactif sécurisé pour répondre aux questions communes et spécifiques à votre profil.
- **Intelligence Artificielle & n8n** : Analyse sémantique des CV, extraction des compétences et génération de synthèses d'entretiens orchestrées via des webhooks n8n dédiés.

---

## 🚀 Fonctionnalités clés

### 1. Espace Recruteur
- **Tableau de bord (`/`)** :
  - Liste interactive des candidatures avec statut, recommandation IA, compétences détectées (jusqu'à 10 avec badge `+N`), score de correspondance global et statut du pré-entretien.
  - Sélection multiple pour analyser ou supprimer des candidatures en lot.
  - Volet latéral détaillé par candidat : visualisation du CV, détail par catégorie, synthèse du pré-entretien, bouton de déclenchement manuel de la synthèse.
  - Décisions de recrutement : confirmation humaine obligatoire (invitation à un rendez-vous avec message personnalisé ou refus de candidature).
- **Page Rendez-vous (`/rendez-vous`)** :
  - Suivi des candidats invités en entretien avec historique du message envoyé et date.
- **Paramétrage (`/parametrage`)** :
  - Import et découpage automatique de fiches de poste via n8n en 8 sections éditables (Intitulé, Description, Missions, Compétences attendues, Expérience, Diplômes/certifications, Localisation, Type de contrat).
  - Définition du seuil de correspondance minimal (par défaut 70 %) conditionnant l'accès au pré-entretien.
  - Personnalisation des questions communes du pré-entretien et des critères de pondération.

### 2. Espace Candidat
- **Page d'accueil candidatures (`/candidats`)** :
  - Dépôt direct de CV au format PDF avec extraction de texte côté client via pdfjs.
  - Définition d'un mot de passe sécurisé (hachage PBKDF2-SHA256) pour accéder ultérieurement à son pré-entretien.
  - Déclenchement automatique de l'analyse dès soumission avec indicateur de progression.
- **Portail de pré-entretien (`/espace-candidat`)** :
  - Accès sécurisé par email et mot de passe (ou lien candidat dédié).
  - Contrôle d'éligibilité : accès bloqué si le score est inférieur ou égal au seuil requis.
  - Questionnaire dynamique regroupant les questions communes et les questions personnalisées générées lors de l'analyse du CV.
  - Sauvegarde automatique au fil de l'eau, écran de relecture et confirmation définitive.

### 3. Intégrations n8n
- **Analyse de CV unitaire** : envoi au webhook de production (`/webhook/a4da0844-bdf2-498c-ab39-181adaa00474`).
- **Analyse de CV en masse** : envoi groupé d'un tableau d'objets candidatures (`/webhook/a4da0844-bdf2-498c-ab39-181adaa00475`).
- **Synthèse de pré-entretien** : transmission des questions/réponses au webhook (`/webhook/ed7b87a7-9c58-44f3-8529-956fadf981ce`) lors de la soumission définitive.
- **Webhooks entrants sécurisés** : réception des résultats via `/api/public/webhook/:name` protégés par secret (`x-webhook-secret` ou `Authorization: Bearer`).
- **Extraction de fiche de poste** : endpoint public sécurisé `GET /api/public/job-description` permettant à n8n de lire les 8 sections de la fiche active.

---

## 🛠️ Stack Technique

- **Framework Web** : [TanStack Start v1](https://tanstack.com/start) (Fullstack React 19, SSR/Edge)
- **Routage** : `@tanstack/react-router` (typage strict des routes par arborescence)
- **Styling** : [Tailwind CSS v4](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com)
- **Backend & Base de données** : Lovable Cloud (PostgreSQL avec Row-Level Security, fonctions RPC sécurisées et buckets de stockage)
- **Extraction PDF** : `pdfjs-dist` (traitement client pour conserver le découpage par page)
- **Sécurité** :
  - Recruteurs : politiques RLS basées sur `is_recruiter()`.
  - Candidats : isolation complète (aucun accès direct aux tables), accès via *server functions* authentifiées par token/email ou PBKDF2.

---

## 📁 Arborescence du projet


├── docs/                      # Documentation des contrats n8n (CV, entretiens, fiches de poste) <br/>
├── src/
│   ├── components/            # Composants UI (RecruiterShell, CandidateSheet, BulkCvDialog, etc.)
│   ├── integrations/          # Clients Lovable Cloud / Supabase
│   ├── lib/
│   │   ├── candidate-portal.* # Fonctions serveur et contrats du portail candidat
│   │   ├── cv-contract.ts     # Schéma Zod et parsing des retours n8n
│   │   ├── cv-analysis-request.ts # Préparation des payloads unitaires et bulk n8n
│   │   ├── interview-summary.ts   # Extraction et parsing des synthèses n8n
│   │   ├── password.ts        # Hachage et vérification PBKDF2
│   │   ├── pdf.ts             # Extraction de texte multi-pages depuis les PDF
│   │   ├── recruitment.*      # Logique métier, scores pondérés et server functions
│   │   └── webhook-auth.ts    # Authentification des requêtes webhook entrantes
│   ├── routes/
│   │   ├── index.tsx          # Tableau de bord recruteur principal
│   │   ├── candidats.tsx      # Page publique d'import candidat
│   │   ├── parametrage.tsx    # Configuration fiche de poste et critères
│   │   ├── rendez-vous.tsx    # Suivi des invitations aux entretiens
│   │   ├── espace-candidat*   # Parcours complet du pré-entretien candidat
│   │   └── api/public/        # Endpoints webhook n8n et fiche de poste
│   └── styles.css             # Tokens CSS globaux et configuration Tailwind
# Orvane Recrutement

##⚙️ Configuration & Variables d'environnement


L'application s'appuie sur les variables d'environnement suivantes :


Variable	Description
VITE_SUPABASE_URL	URL de l'instance backend
VITE_SUPABASE_PUBLISHABLE_KEY	Clé publique pour les requêtes client RLS
N8N_WEBHOOK_SECRET	Secret partagé pour sécuriser les webhooks entrants (x-webhook-secret)
N8N_OUTBOUND_URL	(Optionnel) URL de callback externe



##💻 Développement local

Prérequis
Bun ou Node.js (v20+)


Installation et lancement


# Cloner le dépôt
git clone <url-du-depot>
cd screenshot-perfect

# Installer les dépendances
bun install # ou npm install

# Lancer le serveur de développement
bun dev # ou npm run dev




L'application est accessible localement sur http://localhost:8080.
