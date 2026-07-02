# 2cTake — Backend / Config Runbook (2026-07-01)

The 2cTake app now lives on its **own dedicated Supabase project**. This is the single source of
truth for what's wired and the few things only you can do.

## Project identity

| Thing | Value |
|---|---|
| Supabase project name | **2cTake** |
| Supabase project ref | `urhqlefvqgsrxmbiglau` |
| Supabase URL | `https://urhqlefvqgsrxmbiglau.supabase.co` |
| Region | us-east-1 |
| Dashboard | https://supabase.com/dashboard/project/urhqlefvqgsrxmbiglau |
| Vercel project | `salience-ventures/2c-take` |
| Production domain | `https://www.2ctake.com` (canonical; apex `2ctake.com` 307-redirects to www) |
| Storage | Cloudflare R2 (prod, `VITE_USE_R2=true`) — external, unchanged. Supabase `artifacts`/`recordings` buckets exist as fallback. |

> The old project `jrvwmkgembuqvedynrne` ("salience site db") was the WRONG linkage — it never had
> 2cTake's tables. Nothing points at it anymore.

---

## ✅ Already done (by the agent)

- **Schema rebuilt** on `urhqlefvqgsrxmbiglau`: wiped the old throwaway app's `public` schema, then
  applied migrations 001→013 — tables (`sessions`, `reviewers`, `recordings`, `transcripts`,
  `users_2ctake`, `comments`, `contacts`, `message_templates`, `messages_log`), all RLS, the 4
  share-token RPCs (`get_session_by_token`, `register_reviewer`, `create_recording`, `add_comment`),
  the reviewer-comments feature, the anon-lockdown security fix, and the `artifacts`/`recordings`
  storage buckets. Source: `docs/wipe-and-bootstrap-2ctake.sql`.
- **Vercel env** (production + preview + development): `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY`, `SUPABASE_SERVICE_ROLE_KEY` → new project. All other keys
  (OpenAI, R2_*, Quo, Firecrawl, Google, PostHog) were left untouched.
- **Edge functions** deployed to the new project with JWT verification on: `transcribe`, `mic-test`,
  `fetch-artifact`. Their secrets set: `OPENAI_API_KEY`, `FIRECRAWL_API_KEY`, `R2_*`.
  (`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are auto-injected for edge functions.)
- **Google OAuth** enabled on the new project via API, with your existing client ID/secret.
  Site URL = `https://2ctake.com`; redirect allow-list = `https://2ctake.com/**`,
  `http://localhost:5173/**`, `https://*.vercel.app/**`.
- **Local `.env.local`** updated to the new project.

---

## ⚠️ You must still do these (dashboard / external — the agent can't)

1. **Google Cloud Console → Credentials → your OAuth 2.0 Client** (the one whose ID is in your env):
   - **Authorized redirect URIs** → add:
     `https://urhqlefvqgsrxmbiglau.supabase.co/auth/v1/callback`
   - **Authorized JavaScript origins** → add both `https://www.2ctake.com` and `https://2ctake.com`.
   - Without the redirect URI, "Sign in with Google" returns `redirect_uri_mismatch`.

2. **Revoke the Supabase Personal Access Token** you pasted (it's in the chat transcript):
   https://supabase.com/dashboard/account/tokens → delete it. Nothing on the running app uses it.

3. **Sanity-check the custom domain** `2ctake.com` still resolves to the latest Vercel production
   deployment (it's been attached ~81 days; likely fine).

### Optional / situational
- **Quo A2P 10DLC**: US SMS delivery stays blocked until your Quo workspace number is A2P-approved.
  The `/contacts` texting UI is fully wired and will surface `A2P Registration Not Approved` verbatim
  until then. Nothing to do unless you want SMS live.
- **R2 CORS**: already configured from the prior setup (R2 is external, project-agnostic).

---

## Smoke test (after deploy + the Google step)

1. Open `https://2ctake.com`, **Sign in with Google** → should land on the dashboard (creates a
   `users_2ctake` row via trigger).
2. **New session** → upload a PDF/image → get a share link.
3. Open the share link in an incognito window → enter a name → mic test → record a short take, drop a
   **pin comment** + a **voice comment**, send.
4. Back on the sender's **session detail**: video plays, transcript fills in, **Comments tab** shows
   the pin + the voice note (audio + transcript).

If Google login fails → step 1 of "you must do". If recording upload fails → check the `transcribe`
function logs in the Supabase dashboard.

---

## If you ever need to re-run the DB setup

Paste `docs/wipe-and-bootstrap-2ctake.sql` into the project's SQL editor (⚠️ it drops `public` first).
For a non-destructive fresh project use `docs/bootstrap-2ctake.sql` (no wipe).
