# Contrat n8n — pré-entretiens

Le workflow réel n’a pas été connecté. Configurer `N8N_OUTBOUND_URL` avec son adresse de production. Les requêtes sortantes et les callbacks utilisent `x-webhook-secret: N8N_WEBHOOK_SECRET`. Ne jamais exposer ce secret aux candidats.

## Portail candidat

Les pages `/espace-candidat`, `/espace-candidat/accueil`, `/espace-candidat/questionnaire`, `/espace-candidat/verification` et `/espace-candidat/confirmation` utilisent Cloud Auth sans mot de passe. Une invitation active, datée par le callback `interview-invited`, est obligatoire. Les comptes invités sont provisionnés sans rôle recruteur. Les anciens liens `/candidat/<token>` restent dédiés au dépôt du CV, pas à l’accès aux réponses.

## Événements reçus par n8n

- `interview_requested` (WF-06) : `application_id`, `candidate` (nom/email), `job`, `questions` (snapshots avec identifiants, texte et catégorie), `candidate_url` (page d’accès par e-mail), `expires_at`. L’application assemble toutes les questions communes enregistrées et celles de la dernière analyse CV. Ne générer, réécrire ou remplacer aucune question. Envoyer l’invitation puis appeler `interview-invited`.
- `interview_submit` (WF-07) : `application_id`, `interview_id`, `submitted_at`. Les réponses sont déjà enregistrées et définitivement verrouillées. Lire leur contenu par `interview-submission`, puis déclencher WF-08.
- `interview_summary_requested` : relance demandée par le recruteur ou ancien callback de fin. Utiliser la même lecture sécurisée.

Les réponses sont maintenant sauvegardées directement et atomiquement par l’application : n8n n’est plus nécessaire pour chaque frappe. Une panne n8n ne perd pas les réponses ou la soumission ; la notification est conservée dans `notifications` pour reprise opérationnelle. Aucun webhook WF-06/07/08 n’est inventé : `N8N_OUTBOUND_URL` reste à fournir.

## Callbacks et lecture n8n

POST `/api/public/webhook/<nom>`, avec `x-webhook-secret: N8N_WEBHOOK_SECRET` et `idempotency-key` unique :

- `interview-prepared` : ancien callback compatible ; il réutilise exclusivement les questions enregistrées, sans prendre les nouveaux textes du payload.
- `interview-invited` : `{ application_id }`, après envoi effectif. Date l’invitation et rend le portail accessible.
- `interview-submission` : `{ application_id }`. Retourne uniquement la session soumise, ses questions et réponses. Refuse les sessions non soumises.
- `interview-summary` : `{ application_id, summary: { summary, strengths: [], points_to_verify: [], per_question: [{ question, assessment }] } }`. Enregistre la synthèse sur une session soumise, visible uniquement au recruteur.
- `interview-completed` : compatibilité ancienne ; contrôle toutes les réponses existantes, verrouille et transmet la demande de synthèse à n8n, sans IA locale.

Publier avant les callbacks de production. Le lien magique Cloud Auth est à usage unique ; la session résultante permet de revenir jusqu’à expiration/révocation de l’invitation. Les durées de connexion dépendent des réglages Cloud Auth. Aucune information de score ou d’évaluation interne n’est renvoyée au candidat.

## Analyse des CV (pilotée par n8n)

L’application n’analyse plus les CV avec son IA. Lorsqu’un CV doit être analysé, elle envoie en POST JSON l’événement `cv_analysis_requested` au webhook `https://nmudhoo.n8n-wsk.com/webhook-test/a4da0844-bdf2-498c-ab39-181adaa00474` (endpoint de test : le workflow doit être ouvert dans l’éditeur n8n pour écouter) : `application_id`, `job` (intitulé, description, missions, compétences, expérience, diplômes), `criteria` (`name`, `weight`, `mandatory`) et `cv_pages` (texte par page).

n8n peut répondre directement avec le résultat (« Respond to Webhook », objet `result` ou résultat seul), ou plus tard via `POST /api/public/webhook/cv-analysis-result` :

```json
{ "application_id": "…", "result": { "candidate_summary": "", "experience_summary": "", "skills": [], "criteria_analysis": [{ "criterion": "libellé exact", "status": "documented|partial|not_documented|contradictory|to_verify", "evidence": "", "source": "CV, page 1" }], "missing_information": [], "interview_recommendation": "invite_interview|review|verify", "confidence": 0.9 } }
```

Le score de correspondance est calculé par l’application à partir des critères pondérés. Aucun rejet n’est proposé par n8n.

### Format français (recommandé)
L’application accepte aussi la sortie n8n en français (`experience_professionnelle`, `competences_identifiees`, `pre_entretien`, `recommandation_ia`, `analyse_complete` avec `correspondance_pourcentage` par catégorie `{score, poids_percent, justification}`), y compris enveloppée dans un tableau. Le score affiché est recalculé par l’application à partir des scores et poids des catégories ; `niveau` est converti en recommandation non décisionnelle.
