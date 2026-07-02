# 🏄 sr-viber-surf — Security & Production-Readiness Audit

**Repo:** 2cTake · **Date:** 2026-06-30 · **Commit:** `e1925a5` (working tree dirty — `api/`, migrations 011/012, contacts UI uncommitted)
**Stack:** Vite 7 + React 19 SPA · Vercel serverless functions (`api/*`, legacy `(req,res)` + `webHandler` adapter) · Supabase (Postgres + RLS, Auth/Google OAuth, Edge Functions, Storage) · Cloudflare R2 (staged behind `VITE_USE_R2`) · OpenAI · Quo SMS · PostHog

## Verdict

**Not safe to expose the reviewer flow yet — there is a live cross-tenant data leak.** The public Supabase anon key (shipped in the browser bundle, by design) can read **every reviewer, every recording's metadata + storage keys, and every reviewer comment across all tenants** via an unfiltered `SELECT`. Three tables carry an anon `USING (true)` SELECT policy *plus* a table-level `GRANT` — that combination means an attacker needs to guess nothing; `supabase.from('comments').select('*')` returns the whole table. Everything else (secret hygiene, JWT auth on `/api`, presign authz, owner-scoped contacts/messages) is genuinely solid. Fix the RLS leak and this is in good shape.

| Severity | Count |
|---|---|
| 🔴 Critical | 1 (systemic — 3 tables) |
| 🟠 High | 2 |
| 🟡 Medium | 3 |
| ⚪ Low / Hardening | 4 |

## Must-fix before launch

1. **🔴 Cross-tenant read via anon `USING (true)`** on `comments`, `recordings`, `reviewers` — `supabase/migrations/012_comments.sql:60`, `008_fix_rls_data_leak.sql:75`, `008_fix_rls_data_leak.sql:50` (grants in `007_fix_reviewer_rls.sql:4-5`, `012_comments.sql:66`). Replace with `share_token`-scoped read (RPC, like `get_session_by_token`).
2. **🟠 `quo-webhook` fails OPEN** when `QUO_WEBHOOK_KEY` is unset — `api/quo-webhook.ts:71-78`. A misconfigured deploy turns your A2P number into an open AI-driven SMS relay. Fail closed in production.
3. **🟠 `get_session_by_token` returns `SELECT *`** including `owner_id`/`share_token` to anon — `supabase/migrations/008_fix_rls_data_leak.sql:120-130`. Return an explicit safe column list.

---

## Findings

### 🔴 [SEC-001] Cross-tenant data leak: anon `USING (true)` SELECT on comments, recordings, reviewers
- **Dimension:** Multi-tenant data isolation
- **Where:**
  - `supabase/migrations/012_comments.sql:60-64` — `"Anon can read comments" FOR SELECT TO anon USING (true)`; grant at `:66`
  - `supabase/migrations/008_fix_rls_data_leak.sql:75-78` — `"Anon can read recordings" ... USING (true)`; grant at `007_fix_reviewer_rls.sql:5`
  - `supabase/migrations/008_fix_rls_data_leak.sql:50-53` — `"Anon can read reviewers" ... USING (true)`; grant at `007_fix_reviewer_rls.sql:4`
- **What's wrong:** Each table has both a table-level `GRANT SELECT ... TO anon` and an RLS policy of `USING (true)` for the `anon` role. The `anon` role is the publishable key embedded in the SPA bundle — it is public to anyone who loads the site. `USING (true)` is unconditional, so PostgREST honors an **unfiltered** `select('*')`.
- **Failure scenario:** Any visitor extracts the anon key from the bundle (or just reads `VITE_SUPABASE_*`), instantiates a Supabase client, and runs:
  ```js
  await supabase.from('comments').select('*')   // every comment, all senders
  await supabase.from('recordings').select('*') // every video_url/audio_url storage key + status
  await supabase.from('reviewers').select('*')  // every reviewer name + browser_uuid
  ```
  `comments.body_text` / `comments.transcript_text` are the **actual written and voice-note feedback content** — read across all tenants. `recordings.video_url`/`audio_url` expose the private-bucket object keys for every session. No share token, no UUID guessing required. This is the same vulnerability class migration 008 was created to fix (it fixed `sessions` but kept/added the permissive anon policies on these three tables, and 012 reintroduced it for `comments`).
- **Why "unguessability" does not save it:** the design comments claim safety because object IDs are UUIDs. That defends against *guessing a specific row*, but `USING (true)` permits *enumerating all rows with no predicate*. Unguessability is irrelevant here.
- **Fix:** The reviewer flow only needs to read back rows for the session it holds a valid `share_token` for. Drop the `USING (true)` anon SELECT policies and serve reviewer reads through a `SECURITY DEFINER` RPC keyed on `share_token` (mirror `get_session_by_token`) — e.g. `get_comments_by_token(token, recording_id)` that joins to `sessions.share_token`. Supabase's `.insert().select()` round-trip is the usual reason these broad anon SELECT policies exist; the RPC path replaces it cleanly. Apply to all three tables.
- **Related integrity issue:** `comments` anon INSERT is `WITH CHECK (true)` (`012_comments.sql:54-58`) and `reviewers`/`recordings` have anon INSERT grants — anon can forge rows attributed to **any** `session_id`/`reviewer_id` (spam / poisoned feedback). Scope INSERT `WITH CHECK` to a row reachable from a valid `share_token`.

### 🟠 [SEC-002] `quo-webhook` skips signature verification when the secret is unset (fail-open)
- **Dimension:** Exposed/unauthenticated endpoints
- **Where:** `api/quo-webhook.ts:71-78`
- **What's wrong:** `if (secret) { verify } else { console.warn('skipping signature check') }`. When `QUO_WEBHOOK_KEY` is missing/misnamed in the environment, the endpoint accepts **any** unsigned POST.
- **Failure scenario:** With the key unset, an attacker POSTs a forged `message.received` event with attacker-chosen `senderIdentifier` + `recipientIdentifiers`. The handler logs it, generates an OpenAI reply, and `quoSendMessage` sends that reply via your A2P number to every number in `recipientIdentifiers` (`api/quo-webhook.ts:208-215`) — an open, billable SMS relay sending from your trusted business number. Also burns OpenAI spend.
- **Fix:** In production, treat a missing secret as a hard error — `return json({error:'webhook secret not configured'}, 500)` instead of warn-and-continue. Never fall through to processing.

### 🟠 [SEC-003] `get_session_by_token` returns all session columns (incl. `owner_id`, `share_token`) to anon
- **Dimension:** Authorization / information disclosure
- **Where:** `supabase/migrations/008_fix_rls_data_leak.sql:120-130` (`RETURNS SETOF sessions ... SELECT *`)
- **What's wrong:** The anon-callable RPC returns the entire `sessions` row, including `owner_id` (the sender's `auth.users` UUID) and `share_token`.
- **Failure scenario:** Any reviewer (anon) resolving a share link receives the owner's stable user UUID. Combined with SEC-001's enumeration it strengthens cross-tenant correlation. Returning `share_token` is needless capability echo.
- **Fix:** Change `RETURNS SETOF sessions` to a `RETURNS TABLE(...)` with an explicit allow-list of display columns (`id, title, context, artifact_url, artifact_type, created_at, max_duration, owner_display_name, source_url, source_type`); omit `owner_id` and `share_token`.

### 🟡 [SEC-004] No rate limiting on any endpoint
- **Dimension:** Abuse / cost / resilience
- **Where:** all of `api/*` (no limiter found anywhere in `api/` or `src/`)
- **What's wrong:** `/api/assistant` and `/api/quo-webhook` invoke OpenAI; `/api/quo-send` sends SMS. None is throttled.
- **Failure scenario:** One authenticated account (or, for the webhook, anyone if SEC-002 applies) loops the assistant to run up OpenAI spend, or the webhook is spammed to generate replies. Authentication limits the blast radius for assistant/quo-send to signed-up users, but there's no per-user/IP ceiling.
- **Fix:** Add a lightweight per-user / per-IP limiter (Upstash Redis, Vercel KV/firewall rate rules, or a `messages_log`-style counter) on the AI and SMS endpoints.

### 🟡 [SEC-005] `quo-send` — unbounded recipients, no E.164 validation, unrestricted body & link
- **Dimension:** Abuse / data validation
- **Where:** `api/quo-send.ts:86-91` (raw `to[]` accepted verbatim), `:98` + `:34-42` (`message` free-text → body), `:65` (`link` unchecked)
- **What's wrong:** An authenticated sender can pass an arbitrarily long `to[]` of raw numbers (batched 10/msg but unlimited batches), with fully attacker-controlled body text and an arbitrary `link`. No E.164 format check; no allow-listing the link to your own domain.
- **Failure scenario:** A signed-up user turns the endpoint into a bulk SMS sender from your A2P number with arbitrary content and arbitrary links (spam / phishing / A2P-compliance violation / cost). Garbage numbers are forwarded straight to Quo.
- **Fix:** Cap total recipients per request; validate each number against an E.164 regex; constrain `link` to your deploy origin (`/review/<token>` on your domain); consider a daily per-owner send cap.

### 🟡 [SEC-006] External API calls have no timeout / retry / abort
- **Dimension:** External-API resilience
- **Where:** `api/_shared/quo.ts:22-32` and `:62`, `api/_shared/openai.ts:16-28`
- **What's wrong:** Bare `fetch` with no `AbortSignal`/timeout and no retry/backoff on 429/5xx.
- **Failure scenario:** A slow/hung Quo or OpenAI response holds the function open until the platform timeout (now 300s default) — wasted compute and a stuck request; transient 429s fail the whole send instead of retrying.
- **Fix:** Wrap both in a helper with `AbortSignal.timeout(~10s)` and a small bounded retry/backoff on 429/5xx.

### ⚪ [SEC-007] CORS `Access-Control-Allow-Origin: *` on all `/api`
- **Dimension:** CORS / hardening
- **Where:** `api/_shared/http.ts:14-21`, plus inline copies in `api/r2-presign-upload.ts:116` and `api/r2-presign-download.ts:94`
- **What's wrong:** Wildcard origin. *Acceptable* here because auth is a Bearer JWT (not cookies), so `*` can't be abused for credentialed CSRF — but it's looser than needed.
- **Fix (hardening):** Reflect an allow-list of known origins (prod domain + localhost) instead of `*`.

### ⚪ [SEC-008] R2 upload presign: no content-type allow-list or size ceiling
- **Dimension:** File/storage handling
- **Where:** `api/r2-presign-upload.ts:135-138` (`contentType` taken verbatim), `signPutUrl` `:86-102` (no size condition)
- **What's wrong:** A presigned PUT is minted for any `contentType` with no max object size. An anon reviewer holding a valid `share_token`+`reviewerId` could upload very large or arbitrary-typed blobs to the private recordings bucket.
- **Fix:** Validate `contentType` against an expected set per `kind` (`video/webm`, `application/json`, image types); add a `content-length-range` condition (R2/S3 presigned-POST policy) or enforce a max in a follow-up check.

### ⚪ [SEC-009] Dead over-broad anon grants (latent footgun)
- **Dimension:** Least privilege / hygiene
- **Where:** `supabase/migrations/007_fix_reviewer_rls.sql:7-8` — `GRANT SELECT, INSERT, UPDATE ON transcripts TO anon` and `GRANT UPDATE ON recordings TO anon`
- **What's wrong:** These grants are currently inert (no backing anon RLS policy ⇒ RLS denies), but they linger. If anyone later adds a permissive policy, the grant silently makes it exploitable.
- **Fix:** `REVOKE` the unused anon grants on `transcripts` and the `UPDATE` on `recordings`.

### ⚪ [SEC-010] `quo-send` logs caller-supplied `sessionId` without ownership check
- **Dimension:** Data correctness
- **Where:** `api/quo-send.ts:154` (`session_id: body.sessionId`)
- **What's wrong:** `sessionId` is written to `messages_log` unvalidated. Impact is contained — the row's `owner_id` is the authenticated user, and `messages_log` is owner-scoped — so a user can only mislabel their *own* logs. Low.
- **Fix:** Verify `body.sessionId` belongs to `user.id` before logging, or drop it from the trusted path.

---

## What's solid (verified, not assumed)

- **Secret hygiene is clean.** No service-role / OpenAI / R2 / Quo secret appears anywhere under `src/`; `.env*.local` is gitignored and untracked; server-only vars are documented without `VITE_` prefix (`.env.example`). Only the publishable Supabase key and PostHog key reach the client — expected.
- **All authenticated `/api` endpoints verify the Supabase JWT** server-side via `sb.auth.getUser(jwt)` (`api/_shared/supabase.ts:16-26`); the frontend sends `Authorization: Bearer` correctly (`src/lib/api.ts:14`).
- **Presign endpoints are a real trust boundary.** The server always generates R2 object keys; uploads validate `share_token`→session→reviewer→recording ownership (`api/r2-presign-upload.ts`); downloads verify the caller owns **every** referenced session in one query (`api/r2-presign-download.ts:160-175`).
- **Owner-scoped tables done right:** `contacts`, `message_templates`, `messages_log`, `users_2ctake` all enforce `owner_id = auth.uid()` (migration 011, 002). `transcripts` is locked to owners; anon denied.
- **Storage policies were tightened** to owner-only artifact reads (migration 009, fixing 005).
- **Webhook has HMAC verification + idempotency** (when the key is set): Svix-style signature with timing-safe compare and 5-min skew window, dedup on `quo_message_id` (`api/quo-webhook.ts:30-50,110-118`).
- **No injection surface:** no `dangerouslySetInnerHTML`/`innerHTML`/`eval`/`new Function`, no string-built SQL, no secrets in logs, no empty catch blocks.

## Coverage & caveats

- **Audited in full:** all `api/*` + `api/_shared/*`, all 12 migrations, storage + RLS policies, `src/lib/{supabase,api,r2,upload}.ts`, auth/trust-boundary in `src/state/*` and `src/App.tsx`, injection/secret sweeps.
- **Sampled:** edge functions (`transcribe`, `fetch-artifact`, `mic-test`) reviewed only for service-role usage and authz posture — not a full read.
- **Not run:** `npm audit` (dependency CVEs) — recommended as a manual step. No live/dynamic testing was performed; SEC-001 is a static finding (high confidence, exploitable as written) but worth a 2-minute live confirmation with the anon key.
- **Stage note:** this is pre-revenue. SEC-001 (tenant leak) and SEC-002 (fail-open webhook) genuinely block launch; the Medium/Low items are right-sized to fix as you onboard real users, not blockers.

## Suggested next moves

1. **Close SEC-001 with one migration (013):** drop the three anon `USING (true)` SELECT policies, add `SECURITY DEFINER` `get_*_by_token` RPCs for the reviewer read-backs, and scope anon INSERT `WITH CHECK` to a valid `share_token`. This closes the whole class, not three spots.
2. **Harden the webhook (SEC-002) and the `get_session_by_token` column list (SEC-003)** in the same migration/PR.
3. **Then the systemic hardening:** a shared `fetchWithTimeout` wrapper (SEC-006) and a rate-limit middleware (SEC-004) applied across `api/*`, and recipient/number/link validation in `quo-send` (SEC-005).
