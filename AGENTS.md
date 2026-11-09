<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules (Orvane Recrutement)
- Recruiter pages remain `/` and `/parametrage`, with inline login and candidate side sheets; candidate access, overview, questionnaire, review and confirmation use separate `/espace-candidat` routes. The legacy token URL stays available for CV collection.
- Shared route metadata helpers must live in UI-free modules, not component files, so eager route registration cannot load React Refresh components before the client preamble.
- Recruiters read/write via the browser client under RLS (`is_recruiter()`); candidates never touch tables directly — all candidate access goes through token-checked server functions in `src/lib/recruitment.functions.ts`.
- Candidate links: random token, only its SHA-256 hash is stored, with expiry + revocation; never put internal ids in public URLs.
- CV analysis is delegated to n8n (`cv_analysis_requested` event → `cv-analysis-result` callback); the app only computes the weighted score, keeping one owner for CV inference.
- CV text is extracted in the browser with pdfjs (the AI model has no PDF input); pages are stored in `applications.cv_pages` so evidence can cite pages.
- n8n endpoints: `POST /api/public/webhook/<name>` authenticated by `x-webhook-secret` (or `Authorization: Bearer`) = `N8N_WEBHOOK_SECRET`, read via `readSecret` (Worker `env` first, since online `process.env` may lack it), deduped by `idempotency-key`; outbound events go to optional `N8N_OUTBOUND_URL`.
- Scoring/filter rules are pure functions in `src/lib/recruitment.ts` with tests next to them.
- Bulk CV import stores files sequentially without AI fan-out; CVs are analysed only through an explicit recruiter action. A single row sends one candidature object; a selection sends ONE request whose body is the array of candidature objects (`[{candidature}, {candidature}]`), so n8n owns batch inference.
- Interview questions snapshot all saved common and CV-analysis questions without generation or duplicates; atomic service-role-only RPCs save and submit token-authorized candidate answers, preventing submission/edit races. n8n owns post-submission summaries (questions+answers are POSTed to its fixed summary webhook on submit); access never requires sending an invitation.
- Candidate access exchanges an existing valid link and matching email for an HttpOnly cookie containing that link; every portal operation revalidates its hash, expiry and revocation. Candidate tables remain inaccessible through RLS, and leaving the portal never signs out the recruiter.
- Email-only portal testing is fully open per explicit user decision (test phase): entering a candidate's email stores it in browser localStorage and sends it with every portal call (a 7-day partitioned cookie is only a fallback, since preview iframes may drop cookies), with no token, password or recruiter session; this must be tightened again before real candidate use.
- Job-description files are forwarded as multipart `file` through a recruiter-checked server function to the fixed public n8n webhook; validate all eight returned sections before filling the editable form, and persist only on explicit save to prevent partial or unreviewed replacements.
- n8n reads the saved job description from `GET /api/public/job-description` (same `x-webhook-secret` check as the other n8n endpoints); that handler selects only the eight section columns, so email templates and other job settings never leave the app.
- Candidate portal access (entry and every portal call) is server-blocked unless the application's match score is strictly above its job's threshold (`requiresInterview`), so the dashboard label and actual access never diverge.
