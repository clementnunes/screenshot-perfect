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