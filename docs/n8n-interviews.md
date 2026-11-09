# Contrat n8n — pré-entretiens

Le workflow réel n’a pas été connecté. Configurer `N8N_OUTBOUND_URL` avec son adresse de production. Les requêtes sortantes et les callbacks utilisent `x-webhook-secret: N8N_WEBHOOK_SECRET`. Ne jamais exposer ce secret aux candidats.

## Portail candidat

Les pages `/espace-candidat`, `/espace-candidat/accueil`, `/espace-candidat/questionnaire`, `/espace-candidat/verification` et `/espace-candidat/confirmation` utilisent le lien candidat existant, valide et non révoqué. Depuis `/candidat/<token>`, le candidat rejoint `/espace-candidat?token=<token>` et saisit son e-mail correspondant. Aucun e-mail ni compte Cloud Auth n’est nécessaire. Un cookie HttpOnly conserve le lien ; chaque lecture, sauvegarde et soumission contrôle de nouveau son hash, son expiration et sa révocation. Les questions enregistrées sont préparées lors de cet accès sans n8n.

## Événements reçus par n8n

- `interview_requested` (WF-06) : ancien événement, non envoyé par le bouton « Préparer le pré-entretien ». Ce bouton assemble localement toutes les questions communes enregistrées et celles de la dernière analyse CV. Ne générer, réécrire ou remplacer aucune question. Aucune invitation n’est nécessaire.
- `interview_submit` (WF-07) : `application_id`, `interview_id`, `submitted_at`. Les réponses sont déjà enregistrées et définitivement verrouillées. Lire leur contenu par `interview-submission`, puis déclencher WF-08.
- `interview_submitted` : envoyé à `INTERVIEW_SUMMARY_WEBHOOK_URL` (production) uniquement à la soumission du pré-entretien et par le bouton recruteur « Test générer synthèse » — jamais à chaque sauvegarde de réponse. Clé d'idempotence = `interview_id` à la soumission, unique pour un relancement manuel. L'application attend la synthèse dans la réponse HTTP (`synthese_globale.resume`, ou `resume` à la racine) et l'enregistre aussitôt ; au-delà de 2 minutes sans réponse, la génération est considérée comme perdue et le recruteur peut relancer.

Les réponses sont maintenant sauvegardées directement et atomiquement par l’application : n8n n’est plus nécessaire pour chaque frappe. Une panne n8n ne perd pas les réponses ou la soumission ; la notification est conservée dans `notifications` pour reprise opérationnelle. Aucun webhook WF-06/07/08 n’est inventé : `N8N_OUTBOUND_URL` reste à fournir.

## Callbacks et lecture n8n

POST `/api/public/webhook/<nom>`, avec `x-webhook-secret: N8N_WEBHOOK_SECRET` et `idempotency-key` unique :

- `interview-prepared` : ancien callback compatible ; il réutilise exclusivement les questions enregistrées, sans prendre les nouveaux textes du payload.
- `interview-invited` : ancien callback compatible, date un éventuel envoi mais ne conditionne plus l’accès au portail.
- `interview-submission` : `{ application_id }`. Retourne uniquement la session soumise, ses questions et réponses. Refuse les sessions non soumises.
- `interview-summary` : `{ application_id, synthese_globale: { resume, points_forts?, points_a_verifier?, per_question? } }` — ou la forme applicative `{ application_id, summary: { summary, strengths, points_to_verify, per_question } }`. Enregistre la synthèse sur une session soumise, visible uniquement au recruteur.
- `interview-completed` : compatibilité ancienne ; contrôle toutes les réponses existantes, verrouille et transmet la demande de synthèse à n8n, sans IA locale.

Publier avant les callbacks de production. Le lien candidat et son cookie permettent de revenir jusqu’à expiration/révocation du lien. Quitter l’espace supprime ce cookie sans affecter la session recruteur. Aucune information de score ou d’évaluation interne n’est renvoyée au candidat.

## Analyse des CV (pilotée par n8n)

L’application n’analyse plus les CV avec son IA. Lorsqu’un CV doit être analysé, elle envoie en POST JSON l’événement `cv_analysis_requested` au webhook `https://nmudhoo.n8n-wsk.com/webhook-test/a4da0844-bdf2-498c-ab39-181adaa00474` (endpoint de test : le workflow doit être ouvert dans l’éditeur n8n pour écouter) : `application_id`, `job` (intitulé, description, missions, compétences, expérience, diplômes), `criteria` (`name`, `weight`, `mandatory`) et `cv_pages` (texte par page).

### Analyse en masse (sélection de candidatures)

Bouton « Analyser » sur une sélection : **une seule requête** vers le webhook d’analyse en masse `https://nmudhoo.n8n-wsk.com/webhook-test/a4da0844-bdf2-498c-ab39-181adaa00475`, dont le corps est le **tableau des objets candidature**, dans l’ordre de la sélection :

```json
[
  { "type": "cv_analysis_requested", "application_id": "…", "job": {…}, "criteria": […], "cv_pages": ["…"] },
  { "type": "cv_analysis_requested", "application_id": "…", "job": {…}, "criteria": […], "cv_pages": ["…"] }
]
```

Chaque objet a exactement la forme de la requête d’analyse unitaire. n8n peut répondre dans le même ordre (ou avec un `application_id` par objet) ; sinon il renvoie chaque résultat par `POST /api/public/webhook/cv-analysis-result`. Une candidature sans texte de CV exploitable est écartée de la requête, marquée en erreur, et n8n ne reçoit que les candidatures analysables (50 maximum par envoi).

n8n peut répondre directement avec le résultat (« Respond to Webhook », objet `result` ou résultat seul), ou plus tard via `POST /api/public/webhook/cv-analysis-result` :

```json
{ "application_id": "…", "result": { "candidate_summary": "", "experience_summary": "", "skills": [], "criteria_analysis": [{ "criterion": "libellé exact", "status": "documented|partial|not_documented|contradictory|to_verify", "evidence": "", "source": "CV, page 1" }], "missing_information": [], "interview_recommendation": "invite_interview|review|verify", "confidence": 0.9 } }
```

Le score de correspondance est calculé par l’application à partir des critères pondérés. Aucun rejet n’est proposé par n8n.

### Format français (recommandé)
L’application accepte aussi la sortie n8n en français (`experience_professionnelle`, `competences_identifiees`, `pre_entretien`, `recommandation_ia`, `analyse_complete` avec `correspondance_pourcentage` par catégorie `{score, poids_percent, justification}`), y compris enveloppée dans un tableau. Le score affiché est recalculé par l’application à partir des scores et poids des catégories ; `niveau` est converti en recommandation non décisionnelle.
