# Contrat n8n — pré-entretiens

Le workflow réel n’a pas été connecté. Configurer `N8N_OUTBOUND_URL` avec son adresse de production. Les requêtes sortantes et les callbacks utilisent `x-webhook-secret: N8N_WEBHOOK_SECRET`. Ne jamais exposer ce secret aux candidats.

## Événements reçus par n8n

- `interview_requested` : `application_id`, candidat (nom/email), fiche de poste, `cv_pages`, `question_templates`, `candidate_url`, `expires_at`. Générer quatre questions communes et deux personnalisées, puis inviter le candidat. Le lien est renouvelé à chaque demande.
- `interview_answer` : `application_id`, `question_id`, `answer_text`, `input_mode`, `next_index`. Persister via le callback avant de répondre à la requête sortante.
- `interview_submit` : `application_id`. Confirmer la fin via le callback avant de répondre à la requête sortante.

Le header sortant `idempotency-key` identifie l’événement. Dédupliquer les événements dans n8n. L’application n’annonce une sauvegarde qu’après lecture de la réponse effectivement enregistrée.

## Callbacks n8n

POST vers `/api/public/webhook/<nom>`, avec `x-webhook-secret` et un `idempotency-key` unique par opération :

- `interview-prepared` : `{ application_id, questions: [{ question, kind: "common" | "personalized" }] }`. Exactement quatre communes et deux personnalisées. Retourne les identifiants des questions nécessaires aux réponses. Le questionnaire ne peut plus être remplacé après le début.
- `interview-invited` : `{ application_id }`. À appeler après l’envoi effectif de l’invitation ; passe le dossier à « Pré-entretien à réaliser ».
- `interview-answer` : `{ application_id, question_id, answer_text, input_mode: "text" | "voice", next_index }`. Limite : 5 000 caractères et index 0–5. La question doit appartenir au pré-entretien ; un entretien terminé est verrouillé.
- `interview-completed` : `{ application_id }`. Refuse la clôture si les six réponses ne sont pas sauvegardées. Enregistre la fin puis lance la synthèse professionnelle existante. Aucune décision de recrutement n’est prise par n8n ou l’IA.

Les réponses vocales sont uniquement des transcriptions texte ; voix, accent et émotions ne sont pas analysés. Les candidats continuent à utiliser leur lien individuel, sans accès direct aux données.

Publier l’application avant de configurer des callbacks de production. Utiliser l’origine publiée réelle, sans identifiant interne dans le lien candidat.
## Analyse des CV (pilotée par n8n)

L’application n’analyse plus les CV avec son IA. Lorsqu’un CV doit être analysé, elle envoie en POST JSON l’événement `cv_analysis_requested` au webhook `https://nmudhoo.n8n-wsk.com/webhook-test/a4da0844-bdf2-498c-ab39-181adaa00474` (endpoint de test : le workflow doit être ouvert dans l’éditeur n8n pour écouter) : `application_id`, `job` (intitulé, description, missions, compétences, expérience, diplômes), `criteria` (`name`, `weight`, `mandatory`) et `cv_pages` (texte par page).

n8n peut répondre directement avec le résultat (« Respond to Webhook », objet `result` ou résultat seul), ou plus tard via `POST /api/public/webhook/cv-analysis-result` :

```json
{ "application_id": "…", "result": { "candidate_summary": "", "experience_summary": "", "skills": [], "criteria_analysis": [{ "criterion": "libellé exact", "status": "documented|partial|not_documented|contradictory|to_verify", "evidence": "", "source": "CV, page 1" }], "missing_information": [], "interview_recommendation": "invite_interview|review|verify", "confidence": 0.9 } }
```

Le score de correspondance est calculé par l’application à partir des critères pondérés. Aucun rejet n’est proposé par n8n.

### Format français (recommandé)
L’application accepte aussi la sortie n8n en français (`experience_professionnelle`, `competences_identifiees`, `pre_entretien`, `recommandation_ia`, `analyse_complete` avec `correspondance_pourcentage` par catégorie `{score, poids_percent, justification}`), y compris enveloppée dans un tableau. Le score affiché est recalculé par l’application à partir des scores et poids des catégories ; `niveau` est converti en recommandation non décisionnelle.
