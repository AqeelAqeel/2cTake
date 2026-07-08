# 2c Take — Current State

> **Snapshot doc.** A single source of truth for what 2c Take is, how it's built, what it can
> do, and where the wiring lives. Read this first before touching the codebase.
>
> | | |
> |---|---|
> | **Branch** | `main` |
> | **Current commit** | `e1925a5` — *Decouple messages_log.session_id from shared public.sessions FK* (working tree adds reviewer comments + anon lockdown, migrations 012/013, uncommitted) |
> | **Doc generated** | 2026-06-30 |
> | **Companion doc** | [`AGENTS_LLM_PRODUCT.md`](./AGENTS_LLM_PRODUCT.md) — deep product/agent narrative · [`COMMENTS_SPEC.md`](./COMMENTS_SPEC.md) — reviewer comments spec |

> **✅ Database (resolved 2026-07-01).** 2cTake runs on its own dedicated Supabase project
> **`urhqlefvqgsrxmbiglau`** (name "2cTake", us-east-1). The earlier prod linkage pointed at the wrong
> project (`jrvwmkgembuqvedynrne`, "salience site db") which never had 2cTake's tables. The dedicated
> project was rebuilt from scratch (migrations 001→013 + buckets via `docs/wipe-and-bootstrap-2ctake.sql`),
> Vercel env repointed, edge functions deployed, and Google OAuth enabled. See
> [`SETUP_2CTAKE.md`](./SETUP_2CTAKE.md) for the full runbook + the remaining Google Cloud Console step.
> Note: this machine's Supabase CLI is a **different account** than the one owning `urhqlefvqgsrxmbiglau`;
> operations use a PAT for that account via the Management API / `SUPABASE_ACCESS_TOKEN`.

---

## 1. Product intent

**2c Take** ("two cents take") is async, face-to-camera feedback on a single artifact.

A **sender** uploads a document, PDF, or image (or imports one from a URL), writes a little context,
and gets a shareable link. A **reviewer** opens that link — no account needed — sees the artifact,
records a short webcam-narrated reaction while marking up the document live, and their take is
transcribed and surfaced back to the sender. The sender watches the recordings, reads the
transcript, and replays the annotations the reviewer drew.

The core bet: a 90-second talking-head reaction with on-document scribbles carries far more signal
than a thread of typed comments, and removing the "create an account" wall is what makes reviewers
actually do it.

The two roles drive the whole architecture:

- **Sender** — authenticated (Google OAuth). Owns sessions, sees the dashboard, watches takes.
- **Reviewer** — anonymous. Identified only by a `browser_uuid` + a name they type in. Reaches
  everything through an unguessable `share_token`.

---

## 2. End product & capabilities

### Sender side (authenticated)
- Google OAuth sign-in; profile auto-synced from Google into `users_2ctake`.
- **Dashboard** of all owned sessions with per-session recording counts.
- **New session wizard** — upload a PDF / image / document file *or* import from a URL (Google
  Docs/Slides/generic webpage → rendered to a PDF/screenshot artifact). Set title, context, and an
  optional max recording duration.
- **First-time sender onboarding wizard** (added `6894d10`).
- **Session detail** — list of reviewer recordings, video playback with **mini / theater player
  toggle**, full transcript panel with timestamps, and **annotation playback** synced to the video.
- Edit session metadata; delete session (cascades to reviewers/recordings/transcripts).
- Personalized **reviewer briefing** carries the sender's display name into the share experience.

### Reviewer side (anonymous, via `/review/:shareToken`)
- No login. Enters a name; a stable `browser_uuid` is persisted locally.
- **Onboarding tutorial** (`OnboardingOverlay`): a swipeable, skippable carousel of **four animated
  feature demos** — each a lightweight looping mini-mock of the reviewer UI that "plays out" the
  feature: (1) markup tools, (2) sticky comments, (3) recording + live transcription, (4)
  pause/preview/re-record. Demos live in `src/components/onboarding/*` (`DemoFrame` + `MarkupDemo` /
  `CommentDemo` / `RecordingDemo` / `ControlsDemo`); animations are pure CSS `rob-*` keyframes in
  `index.css` (honor `prefers-reduced-motion`).
- **Permissions gate** + **mic test** (audio sent to a Whisper-backed edge function to confirm the
  mic actually works) — the mandatory final step of the tutorial (Skip jumps straight here).
- **Artifact viewer** with multi-page PDF rendering, document scroll/pan, and clamped viewport
  bounds (artifact can't be panned off-screen).
- **Annotation canvas** (Fabric.js) — draw/shape/marker tools over the artifact while recording;
  strokes are timestamped for playback.
- **Recorder** — webcam picture-in-picture composited over the artifact, audio-only fallback,
  countdown overlay, pause/resume, preview-before-send, and an upload-progress UI.
- On finish: the video (and annotation JSON) upload, a recording row is created, and transcription
  is triggered automatically.

### Contacts & Texting (Quo)
- **`/contacts` route** (sender, protected): an address book (name + E.164 phone, with a
  confirmed flag), reusable **message templates** (`{{link}}`/`{{name}}`/`{{sender}}` placeholders),
  and a composer to **text a review link to up to 10 contacts at once as a Quo group chat**.
- **Message counting**: every outbound and inbound SMS is logged to `messages_log`; the page shows
  running "sent / received" counts. There is no app-imposed cap on contacts or messages.
- **In-app AI assistant** (`/api/assistant`): a chat widget on `/contacts`, grounded in the product
  docs, that answers questions about 2c Take and helps draft texts.
- **SMS AI bot** (`/api/quo-webhook`): when a recipient replies in the group thread, an AI reply
  (grounded in the same product context) is generated and sent back via Quo. Inbound deliveries are
  HMAC-verified (Svix-style) with `QUO_WEBHOOK_KEY`.
- **A2P note:** the Quo workspace number is `+19168667867`; US SMS delivery is gated by Quo A2P
  10DLC registration. Until the org is approved, Quo sends return `A2P Registration Not Approved` —
  the integration is fully wired and surfaces that error verbatim.

### AI context settings, Projects & Coaching
- **`/settings` route** — per-user **AI context settings** (`user_settings`): how the AI should
  represent them, tone, goals. These defaults inform the in-app assistant, the SMS bot, and the coach.
- **`/projects` route** — a **project** is "a thing you're getting feedback on." Each has its own
  `ai_instructions` (layered on the user defaults) and a **Feedback Coach** chat that aggregates the
  inbound replies collected for that project. Sends from `/contacts` can be tagged with a project so
  replies roll up correctly (`messages_log.project_id`).
- **`/api/coach`** — aggregates the owner's inbound SMS (and, once the schema exists, reviewer video
  transcripts) and runs an AI coaching chat that surfaces themes/sentiment/next-actions. Feeds the AI
  **contact names only, never phone numbers**, honoring the tenancy rule below.
- **Multi-tenancy:** every new table is owner-scoped by `auth.uid()` RLS; a username is never
  correlated with a phone number across tenants.
- **OpenAI:** the project-scoped key (`sk-proj-…`) works as-is; `_shared/openai.ts` also forwards
  optional `OpenAI-Project` / `OpenAI-Organization` headers (`OPENAI_PROJECT` / `OPENAI_ORGANIZATION`).

### Cross-cutting
- Product analytics + session replay via **PostHog**; traffic analytics via **Vercel Analytics**.
- Whisper transcription pipeline with timestamped segments.

---

## 3. Architecture & infrastructure

```
┌──────────────────────────── Browser (SPA) ────────────────────────────┐
│  React 19 + Vite 7 + TypeScript + Tailwind v4 + React Router v7        │
│  Zustand stores · Fabric.js canvas · pdf.js · MediaRecorder           │
└───────┬───────────────────────┬───────────────────────┬───────────────┘
        │ supabase-js           │ fetch /api/*           │ direct PUT/GET
        ▼                       ▼                        ▼
┌───────────────┐    ┌─────────────────────┐    ┌────────────────────────┐
│   Supabase    │    │  Vercel Functions    │    │  Storage               │
│  Postgres+RLS │    │  /api/r2-presign-*   │    │  Supabase Storage  ──┐  │
│  Auth (OAuth) │    │  (presign + authz)   │    │  Cloudflare R2  ◄────┘  │
│  Edge Funcs   │    └─────────────────────┘    │  (behind VITE_USE_R2)  │
│  transcribe   │                                └────────────────────────┘
│  mic-test     │           External: OpenAI Whisper · Firecrawl
│  fetch-artifact│
└───────────────┘
```

### Stack
| Layer | Tech |
|---|---|
| Frontend | React 19, Vite 7, TypeScript ~5.9, Tailwind CSS v4 (`@tailwindcss/vite`), React Router v7 |
| State | Zustand v5 (`authStore`, `sessionStore`, `recorderStore`, `annotationStore`) |
| Canvas / media | Fabric.js v6, pdfjs-dist v4, `@use-gesture/react`, browser `MediaRecorder` |
| Local persistence | `idb` (IndexedDB) for browser-side reviewer identity / recovery |
| Backend-as-a-service | Supabase (Postgres, Auth, Storage, Edge Functions) |
| Serverless | Vercel Functions (`/api/*`) using `aws4fetch` to sign R2 requests |
| Object storage | Supabase Storage **today**; Cloudflare R2 staged behind a flag |
| AI | OpenAI Whisper (`whisper-1`) for transcription + mic test |
| URL import | Firecrawl (URL → PDF/screenshot) inside `fetch-artifact` |
| Analytics | PostHog (`posthog-js`, session replay) + Vercel Analytics |
| Hosting | Vercel (SPA rewrite to `index.html`) |

### Hosting / build
- `vercel.json` rewrites all paths to `/index.html` (client-side routing SPA).
- Build: `tsc -b && vite build`. Dev: `vite`. Lint: `eslint .`.
- TS is split into project references: `tsconfig.app.json` (SPA), `tsconfig.api.json` (Vercel
  functions), `tsconfig.node.json`. `vite.config.ts` excludes `pdfjs-dist` from dep optimization.

---

## 4. Backend routes & functions

### Vercel Serverless Functions (`/api`)
| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/r2-presign-upload` | POST | share_token+reviewer (anon) **or** Supabase JWT (artifact) | Mints a short-lived (5 min) presigned **PUT** to R2. Three `kind`s: `recording`, `annotation`, `artifact`. **Server always generates the object key** so a reviewer can't overwrite another session's objects. |
| `/api/r2-presign-download` | POST | Supabase JWT | Batch-mints presigned **GET** URLs (1 hr TTL) for the private recordings bucket. Verifies the caller owns *every* session referenced by the requested keys in one query; max 200 keys/request. |
| `/api/quo-send` | POST | Supabase JWT | Texts a review link via Quo to saved contacts and/or raw numbers. Resolves contacts, fills the template, sends in 10-recipient batches (each a group chat), logs every recipient to `messages_log`. |
| `/api/quo-webhook` | POST | Quo HMAC sig | Inbound-message webhook. Verifies the Svix-style signature, logs the incoming text, generates a docs-grounded AI reply, sends it back into the conversation via Quo, logs that too. |
| `/api/assistant` | POST | Supabase JWT | In-app AI chatbot grounded in the product docs + the caller's AI context settings (OpenAI). Powers the chat widget on `/contacts`. Accepts optional `projectId`. |
| `/api/coach` | POST | Supabase JWT | Aggregates the owner's inbound feedback (SMS today, transcripts later), optional `projectId` filter, and runs an AI coaching chat grounded in user/project AI context. |

> **Vercel function gotcha:** this project's runtime invokes functions with the legacy Node
> `(req, res)` signature, and transpiles each `api/*.ts` file-by-file (no bundling). So (1) local
> relative imports must use **`.js`** extensions (e.g. `./_shared/http.js`), and (2) handlers are
> wrapped with `webHandler()` (`api/_shared/http.ts`), a small adapter that bridges Node `(req,res)`
> ↔ the Web `Request`/`Response` API the handlers are written against. **Raw body:** `webHandler`
> reads `req.rawBody` (the untouched bytes Vercel attaches) first — required for the Quo webhook's
> HMAC verification, since re-serializing the parsed JSON would not be byte-identical and would fail
> the signature.

### Supabase Edge Functions (`supabase/functions`)
| Function | Trigger | External | Purpose |
|---|---|---|---|
| `transcribe` | After a recording upload | OpenAI Whisper | Downloads the recording (R2 primary with Supabase fallback), transcribes to text + timestamped segments, writes the `transcripts` row. |
| `mic-test` | Reviewer onboarding | OpenAI Whisper | Accepts an audio blob, returns a transcription so the reviewer can confirm their mic works. |
| `fetch-artifact` | New session via URL import | Firecrawl | Fetches a URL (Google Docs/Slides or generic page), converts to PDF/screenshot, uploads to the artifacts bucket (R2 when configured, else Supabase). |

### Postgres RPC
| Function | Grants | Purpose |
|---|---|---|
| `get_session_by_token(token text)` | `anon`, `authenticated` | `SECURITY DEFINER` lookup of a session by `share_token`. Replaced the old public `SELECT` policy — this is the only way an anonymous reviewer resolves a share link (migration 008). |
| `register_reviewer(token, name, browser_uuid)` | `anon`, `authenticated` | `SECURITY DEFINER` (migration 013). Validates `share_token`→session, inserts a `reviewers` row, returns its id. Replaces direct anon INSERT. |
| `create_recording(token, reviewer_id, video_url)` | `anon`, `authenticated` | `SECURITY DEFINER` (013). Validates token→session and reviewer membership, inserts a `recordings` row, returns its id. Replaces direct anon INSERT. |
| `add_comment(token, reviewer_id, recording_id, body_text, audio_url, anchor, timestamp_ms)` | `anon`, `authenticated` | `SECURITY DEFINER` (012). Validates token→session→reviewer→recording, inserts a `comments` row, returns its id. The only anon write path for comments. |

### Frontend data layer
All Supabase reads/writes funnel through Zustand stores (notably `src/state/sessionStore.ts`):
`fetchSessions`, `fetchSession`, `fetchSessionByToken`, `createSession`, `updateSession`,
`fetchRecordings`, `fetchTranscript`, `fetchAnnotations`, `fetchComments`, `deleteSession`. Upload
orchestration lives in `src/lib/upload.ts` (now calls the `register_reviewer` / `create_recording` /
`add_comment` RPCs for anon writes) and `src/lib/r2.ts`. Reviewer comment capture is in
`src/state/commentStore.ts`, `src/lib/commentDictation.ts`, and `src/components/comments/*`.

---

## 5. Data model

All tables in `public`. UUID PKs via `pgcrypto`. (`supabase/migrations/001_initial.sql` + later.)

- **`sessions`** — `owner_id → auth.users`, `title`, `context`, `artifact_url` (storage key),
  `artifact_type` (`pdf` | `image` | `document`), `share_token` (unique), `max_duration`,
  `source_url`, `source_type`, `owner_display_name`, `created_at`.
- **`reviewers`** — `session_id`, `name`, `browser_uuid`, `created_at`. Created anonymously.
- **`recordings`** — `session_id`, `reviewer_id`, `video_url`, `audio_url`, `duration`, `status`
  (`uploading`→`uploaded`→`transcribing`→`complete`/`failed`), `created_at`.
- **`transcripts`** — `recording_id` (unique 1:1), `text`, `timestamps_json` (`[{start,end,text}]`),
  `status` (`pending`→`processing`→`complete`/`failed`).
- **`users_2ctake`** — mirror of auth profile (`display_name`, `avatar_url`, `email`), populated by
  the `handle_2ctake_new_user()` trigger on `auth.users` insert/update.
- **`contacts`** *(migration 011)* — `owner_id → auth.users`, `name`, `phone` (E.164, unique per
  owner), `confirmed`, `notes`. Owner-scoped RLS.
- **`message_templates`** *(011)* — `owner_id`, `name`, `body` (supports `{{link}}`/`{{name}}`/
  `{{sender}}`). Owner-scoped RLS.
- **`messages_log`** *(011, +`project_id` in 014)* — one row per SMS: `owner_id`, `session_id`,
  `project_id`, `contact_id`, `direction` (`outgoing`|`incoming`), `quo_message_id`,
  `quo_conversation_id`, `from_number`, `to_number`, `content`, `status`. Owner can SELECT; server
  (service_role) inserts. Source of truth for the sent/received counts and coaching aggregation.
- **`user_settings`** *(014)* — one row per owner: `ai_instructions`, `ai_tone`, `ai_goals`, `prefs`.
  Per-user AI context defaults. Owner-scoped RLS.
- **`projects`** *(014)* — `owner_id`, `name`, `description`, `ai_instructions`. A "thing you're
  getting feedback on"; carries per-project AI context. Owner-scoped RLS.

- **`comments`** *(migration 012)* — `session_id`, `reviewer_id`, `recording_id`, `body_text`,
  `audio_url` (voice-clip storage path), `transcript_text`, `transcript_status`
  (`none`→`pending`→`processing`→`complete`/`failed`), `anchor` (`jsonb`:
  `{kind:'pin'|'highlight', x, y, w?, h?}` normalized 0..1 to the artifact), `timestamp_ms`,
  `created_at`. Reviewer pins/highlights/voice notes, buffered client-side and persisted at send time.
  **No anon table access** — owner SELECT only; writes via the `add_comment()` RPC.

TypeScript mirrors live in `src/types/index.ts`, `src/types/annotation.ts`, and `src/types/comment.ts`.

### Storage buckets
- **`artifacts`** — sender uploads + URL-imported artifacts. Private; accessed via signed URLs.
- **`recordings`** — reviewer videos + annotation JSON. Private; accessed via signed URLs.
- Recording keyspace: `{sessionId}/{reviewerId}/{objectId}.webm`; annotations:
  `{sessionId}/{reviewerId}/{recordingId}_annotations.json`. Artifacts: flat `{uuid}.{ext}`.

---

## 6. Architectural governance & security posture

Security here is mostly **Postgres RLS** discipline, and the migration history is the audit trail.
The notable governance facts:

- **Tenant isolation is RLS-enforced.** Authenticated `SELECT`/`UPDATE` policies are all scoped to
  the session owner (`auth.uid() = owner_id`, or an `EXISTS` join through `sessions`).
- **Migration 008 (`fix_rls_data_leak`)** removed the *authenticated* cross-tenant SELECT, but left
  `anon USING (true)` SELECT on `reviewers`/`recordings` (for the `.insert().select()` round-trip) —
  which was itself an **anon** cross-tenant read leak (sr-viber-surf SEC-001).
- **Migration 013 (`lock_down_anon_writes`)** closes that: drops the anon `USING (true)` SELECT +
  anon INSERT policies and revokes the anon table grants on `reviewers`/`recordings`/`transcripts`
  (and the dead `sessions` grant). The two anon write paths move to share-token-gated SECURITY
  DEFINER RPCs (`register_reviewer`, `create_recording`); `comments` (012) never had anon table
  access. **Net: the anonymous reviewer now has zero direct table access — only the four
  share-token RPCs.** Still open from the audit (not yet fixed): `get_session_by_token` returns
  `owner_id` to anon (SEC-003); `quo-send` lacks recipient/link validation + rate limiting
  (SEC-004/005); no external-API timeouts (SEC-006).
- **Migration 009 (`fix_storage_policies`)** tightened the artifacts bucket so authenticated users
  can only sign URLs for artifacts belonging to their own sessions (join to `sessions`), while anon
  reviewers retain read for share-link flows.
- **Edge functions use the `service_role` key** (bypasses RLS) for the transcription/import
  pipelines, so no permissive client-side INSERT/UPDATE policies are needed.
- **Presign endpoints are the trust boundary for R2.** The server validates `share_token` +
  `reviewer_id` (anon) or the Supabase JWT (sender), and *always* generates the object key. The
  `SUPABASE_SERVICE_ROLE_KEY` must never be `VITE_`-prefixed (would leak into the browser bundle).
- **Unguessability** is load-bearing: artifact paths and session IDs are UUIDs, share tokens are
  unique and not enumerable.

---

## 7. Storage migration in flight (R2)

The current HEAD commit stages a **Cloudflare R2** migration behind the `VITE_USE_R2` flag — it is
**not yet flipped on**; Supabase Storage remains the live path.

- `isR2Enabled()` (`src/lib/r2.ts`) gates the client between the Supabase and R2 upload/read paths.
- Edge functions (`transcribe`, `fetch-artifact`) already prefer R2 when `R2_*` env vars are present,
  with automatic **fallback to Supabase Storage** on 404 / missing config — so the cutover can be
  gradual without breaking in-flight data.
- A backfill script, `scripts/migrate-storage-to-r2.ts`, copies existing blobs before the flag flips.
- **Cutover plan:** run the backfill → set `R2_*` secrets in both Vercel and Supabase → set
  `VITE_USE_R2=true` in Vercel.

---

## 8. Frontend routes & key components

| Route | Component | Access |
|---|---|---|
| `/login` | `LandingPage` | public |
| `/auth/callback` | `AuthCallback` | public (OAuth return) |
| `/review/:shareToken` | `ReviewLink` | public (anonymous reviewer) |
| `/` | `Dashboard` (in `Layout`) | protected |
| `/new` | `NewSession` | protected |
| `/contacts` | `Contacts` | protected |
| `/projects` | `Projects` | protected |
| `/settings` | `Settings` | protected |
| `/session/:id` | `SessionDetail` | protected |

`ProtectedRoute` redirects unauthenticated users to `/login`. `PostHogPageview` captures SPA
navigations. Notable components: `Recorder`, `SenderOnboardingWizard`, `FeedbackIntakeScreen`,
`PermissionsGate`, `OnboardingOverlay` + `OnboardingStepMicTest` + the `components/onboarding/*`
animated feature demos, `ArtifactViewer`, `TranscriptPanel`, and the
`components/annotation/*` set (`AnnotationCanvas`, `AnnotationPlayback`, `ToolPalette`,
`useAnnotationGestures`, `useAnnotationTools`). Media/lib helpers: `compositeStream` (webcam PiP),
`pdfRenderer`, `recorder`, `transcription`, `upload`, `r2`, `supabase`, `posthog`.

---

## 9. Procedural — dev, env, deploy

### Scripts
```bash
npm run dev       # vite dev server
npm run build     # tsc -b && vite build
npm run lint      # eslint .
npm run preview   # vite preview (built output)
```

### Environment variables (`.env.example`)
| Var | Scope | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | client | Supabase client |
| `OPENAI_API_KEY` | server / Supabase secret | Whisper transcription + mic test |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Supabase auth | Google OAuth |
| `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST` | client | PostHog analytics |
| `VITE_USE_R2` | client | Feature flag — route storage through R2 |
| `VITE_R2_ARTIFACTS_PUBLIC_BASE` | client | Public base URL for the artifacts bucket |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | **server-only** | R2 signing creds |
| `R2_ARTIFACTS_BUCKET`, `R2_RECORDINGS_BUCKET` | server | Bucket names |
| `SUPABASE_SERVICE_ROLE_KEY` | **server-only** | Presign authz + edge-function pipeline (never `VITE_`) |
| `FIRECRAWL_API_KEY` | Supabase secret | URL import in `fetch-artifact` |
| `NEXT_QUO_API_KEY` | **server-only** | Quo API key (raw `Authorization` header, no Bearer) |
| `QUO_FROM_NUMBER`, `QUO_USER_ID`, `QUO_PHONE_NUMBER_ID` | server | Quo workspace sender identity |
| `QUO_WEBHOOK_KEY` | **server-only** | Quo inbound-webhook HMAC signing secret (base64) |
| `OPENAI_PROJECT`, `OPENAI_ORGANIZATION` | server (optional) | Pin OpenAI calls to a project/org (sk-proj keys work without them) |

> Server-only vars (`R2_*` creds, `SUPABASE_SERVICE_ROLE_KEY`, `FIRECRAWL_API_KEY`) must be set in
> **both** Vercel project env vars **and** via `supabase secrets set`, because both Vercel functions
> and Supabase edge functions read them.

### Deploy
- **Frontend + `/api` functions** → Vercel (SPA build, rewrite to `index.html`).
- **Edge functions** → `supabase functions deploy <transcribe|mic-test|fetch-artifact>`.
- **DB** → migrations in `supabase/migrations/` (apply in order via Supabase CLI). Storage buckets
  `artifacts` and `recordings` must exist and be private.

---

## 10. Recent commit history

```
cd6e55b  Prep Cloudflare R2 storage migration behind VITE_USE_R2 flag   ← HEAD
121d435  Rebrand to 2c Take with new landing page sections
4b5aed8  Add mini/theater player toggle and fix Infinity:NaN duration bug
6894d10  Add sender onboarding wizard for first-time users
46f8aed  Add reviewer briefing screen with sender name personalization
85c1145  Record artifact screen with webcam PiP overlay instead of raw webcam
13173be  Clamp viewport bounds so artifact can't be panned out of view
b02f4b0  Render all PDF pages instead of only page 1, add PDF preview on creation
608a22c  Add document scroll/pan and fix shape tool spawning duplicates
1793e5a  Fix artifact double-scaling bug causing tiny rendering in top-left
c22df7b  Fix canvas drift: require Ctrl/Cmd for wheel zoom, prevent re-render loops
0f020fb  Fix artifact-first layout, compact recorder, and canvas drift
fe7561b  Add PostHog analytics with session replay and user identification
7833391  fixing random shiz
6257907  Add landing page, RLS security hardening, audio-only recording support
e8a257a  Add recording controls and fix mic test transcription
444535d  2c take full fix bro
24f404f  Add interactive annotation canvas for reviewer-side artifact markup
```

### Migration timeline (schema/security evolution)
```
001  Initial schema (sessions/reviewers/recordings/transcripts) + base RLS + buckets
002  users_2ctake profile mirror + auth trigger
003  sessions.max_duration
004  Allow 'document' artifact_type
005  Artifacts bucket storage policies
006  source_url / source_type columns (URL import)
007  Anon reviewer RLS grants (later partially superseded)
008  ⚠ Fix multi-tenant data leak — scope SELECTs, add get_session_by_token() RPC
009  Tighten artifact storage policies to owner-only
010  sessions.owner_display_name
011  Quo texting — contacts, message_templates, messages_log (+ owner-scoped RLS)
014  AI context settings + projects + messages_log.project_id (owner-scoped RLS)
012  comments table (reviewer pins/highlights/voice) — owner SELECT + add_comment() RPC (no anon table access)
013  ⚠ Lock down anon writes — drop anon USING(true) SELECT + INSERT on reviewers/recordings,
     revoke anon grants, move writes to register_reviewer()/create_recording() RPCs (fixes SEC-001)
```

## 11. Applying migrations (direct DB connection)

**Current status: prod (`urhqlefvqgsrxmbiglau`) has migrations 001→014 fully applied (11 tables).**

This machine's Supabase CLI is a different account, but the project's **session-pooler connection
string is in `.env.local` as `SUPABASE_DB_URL`** (gitignored, project-scoped). That means migrations
can be run **programmatically against prod without the CLI or a PAT**:

```bash
python3 -m venv .venv && .venv/bin/pip install psycopg2-binary   # pip is PEP-668 externally-managed
.venv/bin/python - <<'PY'
import os, re, psycopg2
url=[l.split('=',1)[1].strip().strip('"') for l in open('.env.local') if l.startswith('SUPABASE_DB_URL=')][0]
c=psycopg2.connect(url, sslmode="require"); c.autocommit=True
c.cursor().execute(open('supabase/migrations/0XX_whatever.sql').read())
PY
```

The migration files are all idempotent (drops use `if exists`, functions `create or replace`, tables
`if not exists`), so re-running is safe. `docs/bootstrap-2ctake.sql` (fresh) and
`docs/wipe-and-bootstrap-2ctake.sql` (wipe+rebuild) bundle 001→014 + buckets for a full rebuild.

Edge functions deploy with `SUPABASE_ACCESS_TOKEN=<pat> supabase functions deploy <fn> --project-ref urhqlefvqgsrxmbiglau`
(needs a PAT for that account — the direct DB URL can't deploy functions). See `docs/SETUP_2CTAKE.md`.

---

*To refresh this doc, re-read `package.json`, `src/App.tsx`, `src/types/`, `api/`,
`supabase/migrations/`, `supabase/functions/`, and `git log`, then update the HEAD hash in the
header table and §10.*
