# Import de fiche de poste

Le paramétrage envoie le fichier au webhook de production fourni, après authentification du recruteur. Ce webhook public ne nécessite pas de clé d’API n8n ; aucun appel à l’API d’administration n8n n’est effectué.

- URL : `https://nmudhoo.n8n-wsk.com/webhook/197db861-6df7-4b3b-942d-146450422c45`
- Méthode : `POST`, corps `multipart/form-data`, fichier binaire sous la clé `file`.
- Formats acceptés : PDF, DOC, DOCX, TXT ; 10 Mo maximum.
- n8n doit répondre à cette même requête avec un objet JSON contenant les huit sections ; configurer « Respond to Webhook » après l’extraction, pas une simple confirmation de lancement.
- Les noms de sections français sont également acceptés, ainsi que les listes de textes pour les sections.

```json
{
  "title": "Intitulé extrait",
  "description": "Description extraite",
  "missions": "Missions extraites",
  "skills": "Compétences attendues extraites",
  "experience": "Expérience souhaitée extraite",
  "diplomas": "Diplômes ou certifications pertinents extraits",
  "location": "Localisation extraite",
  "contract_type": "Type de contrat extrait"
}
```

Une section non renseignée dans le document doit être une chaîne vide. Ne pas inventer son contenu. Un retour incomplet est rejeté et la fiche actuelle reste intacte. Un import réussi remplit le formulaire sans enregistrer automatiquement : le recruteur peut modifier les sections avant d’enregistrer.

## Lecture de la fiche de poste enregistrée

n8n peut récupérer les huit sections actuellement enregistrées (par exemple pour l’analyse de CV) :

- URL : `GET /api/public/job-description` (également accepté en `POST`)
- Authentification : en-tête `x-webhook-secret` égal à `N8N_WEBHOOK_SECRET` (ou `Authorization: Bearer <secret>`)
- Option : `?job_id=<uuid>` pour cibler une fiche précise ; sans ce paramètre, la fiche de référence de l’application est renvoyée
- Réponse : uniquement `job_id`, les huit sections et `updated_at`. Les messages d’invitation, de confirmation et de réponse négative ne sont jamais renvoyés.

```json
{
  "job_id": "ba509192-ef91-4b8e-817c-15d4aea9929b",
  "title": "Responsable d'entrepôt logistique (H/F)",
  "description": "…",
  "missions": "…",
  "skills": "…",
  "experience": "…",
  "diplomas": "…",
  "location": "…",
  "contract_type": "CDI",
  "updated_at": "2026-11-09T09:29:25.346Z"
}
```

Sans en-tête valide, la réponse est `401`. Une fiche inexistante renvoie `404`.

