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

