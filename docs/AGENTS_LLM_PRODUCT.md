# 2cTake — AI Developer Onboarding & System Map

> **What is this?** A living document for any AI SWE agent working on this codebase. Read this first. It contains the product model, current implementation state, architecture, database schema, data flows, and extension points. Update this file when you make structural changes.
>
> **LLM maintenance rules:** When you add a feature, add a new section to "Feature Catalog" (Section 9). When you add a DB table, update "Database Schema" (Section 6). When you add a route, update "Routes" (Section 7). When you change the recording flow, update "Recording Lifecycle" (Section 8). Always bump the "Last updated" date at the bottom.

---

## 1. Product Summary

**2cTake** is an async artifact feedback recorder. A sender uploads a PDF or image, generates a shareable link, and reviewers open that link to record video+audio reactions. The sender then watches recordings and reads AI-generated transcripts.

**Core flow:** Upload artifact --> Share link --> Reviewer records --> Sender reviews

**Category:** Private async cognition capture over artifacts. Not Loom, not Zoom, not Figma.

---

## 2. End-to-End User Journeys (ASCII Diagrams)

### Journey A: "Create and Share" (Sender creates a session and shares a review link)

```
SENDER (Authenticated)                             SUPABASE (Remote)
========================                           =================

Browser                  Action                    Service          Storage/DB
-------                  ------                    -------          ----------

[Google Login]
  |
  +------ OAuth redirect -----------------------> [Supabase Auth]
  <------ JWT + user profile -------------------- [auth.users] ---> users_2ctake (trigger)
  |
  |  SESSION: user is now on Dashboard (/)
  |
[Click "+ New"]
  |
  |  SESSION: user is now on /new
  |
[Drag/drop artifact]
  |  LOCAL: file held in React state
  |  LOCAL: image preview generated via FileReader
  |
[Fill title + context]
[Select time limit]
  |  LOCAL: form state in component
  |
[Click "Create"]
  |
  +------ Upload file (PDF/image) -------------> [Storage API] ---> artifacts bucket
  |                                                                  path: {uuid}.{ext}
  |                                                                  access: PUBLIC read
  +------ INSERT session row -------------------> [PostgREST] ----> sessions table
  |        { owner_id, title, context,                               share_token: random 12-char
  |          artifact_url, artifact_type,                            artifact_type: 'pdf'|'image'
  |          share_token, max_duration }
  |
  <------ session object + share_token ----------
  |
[Success screen]
[Copy link: /review/{shareToken}]
  |
  +------ Share link via email/chat/etc. -------> [REVIEWER receives URL]
```

### Journey B: "Record Feedback" (Reviewer records a reaction without logging in)

```
REVIEWER (Anonymous)                               SUPABASE (Remote)
====================                               =================

Browser                  Action                    Service          Storage/DB
-------                  ------                    -------          ----------

[Open /review/{shareToken}]
  |
  +------ RPC get_session_by_token(token) ------> [PostgREST] ----> sessions table
  <------ session { title, context,                                  (SECURITY DEFINER RPC,
  |        artifact_url, artifact_type,                               bypasses RLS for anon)
  |        max_duration }
  |
  |  UI: show artifact preview + title + context
  |
[Enter name]
[Click "Start"]
  |
  |  LOCAL: generate or reuse browser_uuid from localStorage
  |         key: "2ctake_browser_uuid"
  |
  +------ INSERT reviewer row ------------------> [PostgREST] ----> reviewers table
  |        { session_id, name, browser_uuid }                        (anon INSERT via RLS)
  <------ reviewer_id ----------------------------
  |
[PermissionsGate: "Allow camera & mic"]
  |
  |  LOCAL: navigator.mediaDevices.getUserMedia()
  |         audio: echoCancellation, noiseSuppression, 44100Hz
  |         video: 1280x720 ideal, user-facing camera
  |
  <------ MediaStream ----------------------------
  |
  |  UI: artifact-first layout — artifact fills screen (AnnotationCanvas),
  |      compact recorder bar at bottom, PiP webcam or audio indicator in corner
  |
[Click "Start Recording"]
  |
  |  LOCAL: MediaRecorder starts
  |         codec: video/webm;codecs=vp9,opus (fallback: video/webm)
  |         bitrate: 2.5 Mbps
  |         chunk interval: 1000ms
  |         chunks accumulate in memory (Blob[])
  |         timer polls every 500ms
  |
  |  [Optional: Pause / Resume — adjusts duration math]
  |  [Optional: auto-stop if maxDuration reached]
  |
[Click "Stop"]
  |
  |  LOCAL: MediaRecorder.stop() fires
  |         chunks merged into single Blob
  |         duration calculated (excludes paused time)
  |
  |  UI: stopped state — can Preview, Re-record, or Send
  |
[Click "Preview"]  (optional)
  |
  |  LOCAL: Blob converted to Object URL
  |         <video> element plays back the recording
  |
[Click "Send"]
  |
  +------ Upload video Blob --------------------> [Storage API] ---> recordings bucket
  |        path: {sessionId}/{reviewerId}/{ts}.webm                  access: PRIVATE
  |        progress: 10% → 60%                                       (service role only)
  |
  +------ INSERT recording row -----------------> [PostgREST] ----> recordings table
  |        { session_id, reviewer_id,                                status: 'uploaded'
  |          video_url (path), duration }
  |        progress: 80%
  |
  +------ INVOKE edge function: transcribe -----> [Edge Function]
  |        { recording_id, video_path }                              (fire-and-forget)
  |        progress: 100%
  |
  <------ { videoUrl, recordingId } ---------------
  |
[Success screen: "Feedback sent!"]
  |
  |  LOCAL: MediaStream tracks stopped, camera/mic released
```

### Journey C: "Review Feedback" (Sender watches recordings and reads transcripts)

```
SENDER (Authenticated)                             SUPABASE (Remote)
========================                           =================

Browser                  Action                    Service          Storage/DB
-------                  ------                    -------          ----------

[Open Dashboard (/)]
  |
  +------ SELECT sessions + count(recordings) --> [PostgREST] ----> sessions table
  <------ session[] with recording_count ---------                   recordings (count)
  |
  |  UI: table/grid of sessions with stats
  |      searchable, sortable (title, type, date, count)
  |
[Click session card]
  |
  |  ROUTE: /session/{sessionId}
  |
  +------ SELECT session -----------------------> [PostgREST] ----> sessions table
  +------ SELECT recordings (join reviewers) ---> [PostgREST] ----> recordings + reviewers
  |
  |  For each recording.video_url (a storage path):
  +------ createSignedUrl(path, 3600) ----------> [Storage API]     1-hour expiry
  <------ signed URL for video playback ----------
  |
  |  UI: left panel  = artifact (PDF iframe or image)
  |      right panel = recording selector pills
  |                    video player
  |                    transcript panel
  |
[Click recording pill]
  |
  +------ SELECT transcript by recording_id ----> [PostgREST] ----> transcripts table
  |
  |  IF status = 'complete':
  |    UI: show timestamped segments, each clickable
  |  IF status = 'pending' or 'processing':
  |    UI: spinner + "Generating transcript..."
  |    LOCAL: pollTranscript() — every 5s, up to 30 attempts (2.5 min)
  |  IF status = 'failed':
  |    UI: "Transcription failed" message
  |
[Click transcript segment]
  |
  |  LOCAL: video.currentTime = segment.start
  |         video seeks to that timestamp
```

### Journey D: "Transcription Pipeline" (Async server-side processing)

```
EDGE FUNCTION (Deno Runtime)                       EXTERNAL / SUPABASE
============================                       ===================

Trigger                  Step                       Service          Storage/DB
-------                  ----                       -------          ----------

[Invoked by client]
  |  input: { recording_id, video_path }
  |
  +------ UPDATE recording -------- status -----> [PostgREST] ----> recordings.status = 'transcribing'
  +------ INSERT transcript row -----------------> [PostgREST] ----> transcripts.status = 'processing'
  |
  +------ Download video from storage -----------> [Storage API] --> recordings bucket
  |        using: SUPABASE_SERVICE_ROLE_KEY                          (private bucket, service role)
  <------ video file bytes -------------------------
  |
  +------ POST /v1/audio/transcriptions ---------> [OpenAI API]
  |        model: whisper-1                                          external: api.openai.com
  |        response_format: verbose_json
  |        timestamp_granularities: [segment]
  <------ { text, segments[] } ---------------------
  |
  |  TRANSFORM: segments.map(s => ({
  |    start: Math.floor(s.start),
  |    end: Math.floor(s.end),
  |    text: s.text.trim()
  |  }))
  |
  +------ UPDATE transcript ---------------------> [PostgREST] ----> transcripts
  |        { text, timestamps_json, status: 'complete' }
  +------ UPDATE recording -------- status -----> [PostgREST] ----> recordings.status = 'complete'
  |
  |  ON ERROR at any step:
  +------ UPDATE transcript status = 'failed' --> [PostgREST]
  +------ UPDATE recording status = 'failed' ---> [PostgREST]
```

---

## 3. Data Residency Map

What lives where, and why.

```
+---------------------------+-------------------------------------------+------------------+
|  LOCATION                 |  WHAT'S STORED                            |  LIFETIME        |
+---------------------------+-------------------------------------------+------------------+
|  Browser: React state     |  Form inputs, recorder state machine,     |  Page session    |
|                           |  media stream, recorded Blob, upload %    |                  |
+---------------------------+-------------------------------------------+------------------+
|  Browser: localStorage    |  browser_uuid (key: 2ctake_browser_uuid)  |  Permanent       |
|                           |  Supabase auth tokens (managed by SDK)    |  Until logout    |
+---------------------------+-------------------------------------------+------------------+
|  Supabase: auth.users     |  Google OAuth identity (id, email, etc.)  |  Account life    |
+---------------------------+-------------------------------------------+------------------+
|  Supabase: users_2ctake   |  Profile mirror (display_name, avatar)    |  Account life    |
|                           |  auto-synced via DB trigger               |                  |
+---------------------------+-------------------------------------------+------------------+
|  Supabase: sessions       |  Session metadata, share_token,           |  Until deleted   |
|                           |  artifact_url, artifact_type, max_dur     |  (cascade)       |
+---------------------------+-------------------------------------------+------------------+
|  Supabase: reviewers      |  Reviewer name + browser_uuid per session |  Until session   |
|                           |                                           |  deleted         |
+---------------------------+-------------------------------------------+------------------+
|  Supabase: recordings     |  Recording metadata, video_url (path),    |  Until session   |
|                           |  duration, status                         |  deleted         |
+---------------------------+-------------------------------------------+------------------+
|  Supabase: transcripts    |  Full text, timestamped segments (JSONB), |  Until recording |
|                           |  processing status                        |  deleted         |
+---------------------------+-------------------------------------------+------------------+
|  Supabase Storage:        |  Uploaded PDFs and images                 |  Until session   |
|  artifacts bucket         |  path: {uuid}.{ext}                       |  deleted         |
|  (PUBLIC read)            |  access: anyone can read                  |                  |
+---------------------------+-------------------------------------------+------------------+
|  Supabase Storage:        |  Recorded video files (.webm)             |  Until session   |
|  recordings bucket        |  path: {sessionId}/{reviewerId}/{ts}.webm |  deleted         |
|  (PRIVATE)                |  access: signed URLs only (1hr) or        |                  |
|                           |  service role key                         |                  |
+---------------------------+-------------------------------------------+------------------+
|  OpenAI (external)        |  Video sent for transcription             |  Transient       |
|                           |  Not stored by 2cTake                     |  (API call only) |
+---------------------------+-------------------------------------------+------------------+
```

---

## 4. User Model

| Role | Auth | Capabilities |
|------|------|-------------|
| **Sender** | Google OAuth via Supabase | Creates sessions, uploads artifacts, shares links, reviews recordings, reads transcripts, edits/deletes sessions |
| **Reviewer** | None (anonymous) | Enters name, records video+audio feedback, submits. Cannot return or see other reviewers |

**Key constraint:** Reviewers are completely isolated. No collaboration. No login. Private pipeline. A reviewer's browser_uuid is tracked via localStorage for device identification, but this does not constitute an account.

---

## 5. Tech Stack

| Layer | Tech | Notes |
|-------|------|-------|
| Frontend | Vite + React 19 + TypeScript | SPA, client-side routing |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite` plugin) | Design tokens in `src/index.css` |
| State | Zustand | 4 stores: auth, session, recorder, annotation |
| Routing | React Router v7 | 5 routes, 2 public, 3 protected |
| Auth | Supabase Auth (Google OAuth) | JWT, auto-refresh |
| Database | Supabase PostgreSQL | RLS enforced, shared instance |
| Storage | Supabase Storage | 2 buckets: `artifacts` (public), `recordings` (private) |
| Transcription | OpenAI Whisper via Supabase Edge Function | Model: whisper-1, verbose_json |
| Icons | Lucide React | Tree-shakeable icon set |

---

## 6. Database Schema

**IMPORTANT:** This project shares a Supabase instance with another app. The other app owns the `users`, `stories`, and `pages` tables. All 2cTake tables use the `users_2ctake` naming convention. Never modify the other app's tables.

### `users_2ctake`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, same as auth.users(id), cascade delete |
| email | text | From Google OAuth |
| display_name | text | From Google profile |
| avatar_url | text | From Google profile |
| created_at | timestamptz | Auto |
| updated_at | timestamptz | Auto |

Auto-populated by a trigger on `auth.users` INSERT/UPDATE. When a user signs in with Google OAuth, `auth.users` gets a row, which fires the trigger to create/update `users_2ctake`.

### `sessions`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, auto-generated |
| owner_id | uuid | FK --> auth.users(id), cascade delete |
| title | text | Required |
| context | text | Optional instructions for reviewers |
| artifact_url | text | Public URL to uploaded artifact |
| artifact_type | text | `'pdf'` or `'image'` (check constraint) |
| share_token | text | Unique, used in review URL, 12-char alphanumeric |
| max_duration | integer | Nullable. Seconds. Auto-stops recording if set |
| source_url | text | Nullable. Original URL if imported via URL |
| source_type | text | Nullable. `'google_docs'`, `'google_slides'`, `'firecrawl'`, or null |
| created_at | timestamptz | Auto |

### `reviewers`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| session_id | uuid | FK --> sessions(id) |
| name | text | Entered by reviewer |
| browser_uuid | text | Stored in localStorage for device tracking |
| created_at | timestamptz | Auto |

### `recordings`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| session_id | uuid | FK --> sessions(id) |
| reviewer_id | uuid | FK --> reviewers(id) |
| video_url | text | Storage path (not a public URL) |
| audio_url | text | Nullable (future: extracted audio) |
| duration | integer | Seconds |
| status | text | `uploading --> uploaded --> transcribing --> complete --> failed` |
| created_at | timestamptz | Auto |

### `transcripts`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| recording_id | uuid | FK --> recordings(id), unique (1:1) |
| text | text | Full transcript text |
| timestamps_json | jsonb | Array of `{ start, end, text }` segments |
| status | text | `pending --> processing --> complete --> failed` |
| created_at | timestamptz | Auto |

### RLS Policies (post-migration 008/009)
- **Sessions:** Owner full CRUD (`auth.uid() = owner_id`). No public SELECT — anonymous share-token lookup via `get_session_by_token()` RPC (SECURITY DEFINER, bypasses RLS).
- **Reviewers:** Authenticated session owners can SELECT their reviewers. Anon can SELECT (needed for `.insert().select()` pattern) and INSERT.
- **Recordings:** Authenticated session owners can SELECT and UPDATE. Anon can SELECT (needed for `.insert().select()`) and INSERT.
- **Transcripts:** Authenticated session owners can SELECT via join. INSERT/UPDATE removed (edge functions use service_role key which bypasses RLS).
- **Storage (artifacts):** Authenticated users can only read artifacts from their own sessions (join check). Anon can read all artifacts (paths are UUIDs, only discoverable via share-token RPC).
- **Storage (recordings):** Anon can upload. Read via signed URLs (owner) or service_role key (edge functions).

### Entity Relationships

```
auth.users (Supabase-managed)
  |
  | 1:1 trigger-sync
  v
users_2ctake
  |
  | 1:N  (owner_id)
  v
sessions --------> artifacts bucket (artifact_url = storage path)
  |
  | 1:N  (session_id)         1:N  (session_id)
  v                           v
reviewers                   recordings --------> recordings bucket (video_url = storage path)
  |                           |
  | N:1  (reviewer_id)        | 1:1  (recording_id, unique)
  +<--------------------------+
                              v
                           transcripts
```

---

## 7. Routes

| Path | Component | Auth | Description |
|------|-----------|------|-------------|
| `/login` | LandingPage | Public | Marketing landing page with Google OAuth sign-in |
| `/` | Dashboard | Protected | Session list with stats, search, sort |
| `/new` | NewSession | Protected | Create session: upload artifact, set title/context/limit |
| `/session/:id` | SessionDetail | Protected | View artifact + recordings + transcripts |
| `/review/:shareToken` | ReviewLink | Public | Full reviewer flow: name --> permissions --> record --> send |

---

## 8. Recording Lifecycle (State Machine)

The recorder has two layers: the `RecordingEngine` class (low-level WebRTC) and the `recorderStore` (UI state).

### RecordingEngine state machine (src/lib/recorder.ts)

```
                         +--[maxDuration reached]--+
                         |                         |
                         v                         |
[not started] --start()--> [recording] --pause()--> [paused] --resume()--> [recording]
                              |                                               |
                              +---stop()---+                                  |
                                           |                                  |
                              +---stop()---+----------------------------------+
                              |
                              v
                          [stopped]
                              |
                          (emits onStop callback with Blob + duration)
```

### recorderStore UI state machine (src/state/recorderStore.ts)

```
[idle] --start--> [recording] --pause--> [paused] --resume--> [recording]
                      |                                           |
                      +---stop---+                                |
                                 |                                |
                      +---stop---+--------------------------------+
                      |
                      v
                  [stopped] --preview--> [preview] --re-record--> [idle]
                      |                      |
                      +------send---+--------+
                                    |
                                    v
                                [uploading] --success--> [success]
                                    |
                                    +--error--> [error]
```

### Duration tracking math

```
elapsed = (now - startTime) - pausedDuration - currentPauseDuration
where:
  startTime      = Date.now() when recording began
  pausedDuration = accumulated ms from completed pauses
  currentPause   = if currently paused: (now - pauseStart), else 0
```

---

## 9. Feature Catalog

Each feature is named in plain English. For each: what it does, which files are involved, and what technical implementation is required.

---

### Feature: "Sign In with Google"

**What it does:** Sender authenticates via Google OAuth to access protected routes.

**User action:** Click "Sign in with Google" on login page. Redirected to Google, then back.

**Files touched:**
| File | Role |
|------|------|
| `src/pages/LandingPage.tsx` | Marketing landing page + Google OAuth sign-in |
| `src/state/authStore.ts` | `signInWithGoogle()`, `initialize()`, `signOut()` |
| `src/lib/supabase.ts` | Supabase client with auth config |
| `src/App.tsx` | `ProtectedRoute` component checks auth state |
| `supabase/migrations/002_users_2ctake.sql` | Trigger auto-creates `users_2ctake` row |

**Technical implementation:**
- `supabase.auth.signInWithOAuth({ provider: 'google' })` initiates redirect
- On return, Supabase SDK auto-restores session from URL hash
- `authStore.initialize()` calls `supabase.auth.getSession()` and subscribes to `onAuthStateChange`
- User object extracted from session: `{ id, email, name (from user_metadata.full_name), avatar_url }`
- `ProtectedRoute` renders spinner while `loading=true`, redirects to `/login` if no user

---

### Feature: "Create Session"

**What it does:** Sender uploads an artifact (PDF or image), sets a title, optional instructions, and optional time limit. Gets a shareable link.

**User action:** Navigate to `/new`. Drag-drop or click-to-select a file. Fill in title. Optionally add context and time limit. Click "Create Session".

**Files touched:**
| File | Role |
|------|------|
| `src/pages/NewSession.tsx` | Full page UI: drag-drop zone, form, success screen |
| `src/state/sessionStore.ts` | `createSession()` — uploads artifact, inserts session row |
| `src/types/index.ts` | `Session` type definition |
| `supabase/migrations/001_initial.sql` | `sessions` table, check constraint on `artifact_type` |
| `supabase/migrations/003_max_duration.sql` | `max_duration` column |

**Technical implementation:**
- File validation: accepts PDF and common image types (validated by file input `accept` attribute)
- Image preview: `FileReader.readAsDataURL()` creates preview in component state
- Upload path: `{crypto.randomUUID()}.{extension}` to `artifacts` bucket
- Share token: 12-char alphanumeric string generated client-side
- `artifact_type` determined by file extension: `.pdf` --> `'pdf'`, everything else --> `'image'`
- Session row created via `supabase.from('sessions').insert()`
- On success: shows success screen with copy-to-clipboard share link
- Time limit options: no limit, 60s, 120s, 180s, 300s (stored as `max_duration` in seconds)

---

### Feature: "Session Dashboard"

**What it does:** Sender sees all their sessions in a searchable, sortable table or grid. Can copy share links, edit sessions, delete sessions.

**User action:** Land on `/` after login. Search, sort, switch view mode, copy links, edit, delete.

**Files touched:**
| File | Role |
|------|------|
| `src/pages/Dashboard.tsx` | Full page UI: stats cards, search, sort, table/grid, modals |
| `src/components/EditSessionModal.tsx` | Modal for editing session title/context |
| `src/state/sessionStore.ts` | `fetchSessions()`, `updateSession()`, `deleteSession()` |

**Technical implementation:**
- `fetchSessions()` queries `sessions` with `.select('*, recordings(count)')` to get recording counts
- Stats cards: total artifacts, total recordings, PDF count, image count — computed client-side from session array
- Search: client-side filter on `title` field (case-insensitive includes)
- Sort: toggleable by title, artifact_type, created_at, recording_count; ascending/descending
- View mode: table or grid (toggle in component state)
- Copy link: `navigator.clipboard.writeText()` with URL `{origin}/review/{share_token}`
- Delete: confirmation modal, then `supabase.from('sessions').delete().eq('id', id)` — FK cascades handle recordings, transcripts, reviewers
- Edit: modal updates title and context via `updateSession()`, optimistically updates local state

---

### Feature: "Reviewer Recording Flow"

**What it does:** Anonymous reviewer opens share link, enters name, grants camera/mic, records video feedback while viewing the artifact, then sends.

**User action:** Open `/review/{shareToken}`. Enter name. Allow camera/mic. Record. Optionally pause/resume. Stop. Optionally preview. Send.

**Files touched:**
| File | Role |
|------|------|
| `src/pages/ReviewLink.tsx` | Orchestrates full flow: loading --> entry --> onboarding --> countdown --> recording --> uploading --> done. Artifact-first layout with floating controls |
| `src/components/OnboardingOverlay.tsx` | Multi-step onboarding: permissions + mic/camera test |
| `src/components/OnboardingStepMicTest.tsx` | Mic test with camera toggle + skip option |
| `src/components/Recorder.tsx` | Recording controls, timer, preview, send button. Supports `compact` mode (thin horizontal bar, no video feed) |
| `src/components/ArtifactViewer.tsx` | Displays PDF (iframe) or image |
| `src/components/UploadProgress.tsx` | Upload progress bar, success/error states |
| `src/components/annotation/AnnotationCanvas.tsx` | Fabric.js canvas: renders artifact as background, supports drawing/shapes/eraser overlays, resize-safe re-centering |
| `src/components/annotation/useAnnotationGestures.ts` | Pinch-to-zoom, two-finger pan, Ctrl/Cmd+scroll zoom (standard canvas behavior) |
| `src/components/annotation/useAnnotationTools.ts` | Configures Fabric.js drawing mode, brush, shapes, eraser based on active tool |
| `src/components/annotation/ToolPalette.tsx` | Floating bottom toolbar: pen, circle, rectangle, eraser, select + color/size pickers |
| `src/components/annotation/StickyToggle.tsx` | Toggle button (top-right) to enable/disable annotation tools |
| `src/components/annotation/ZoomIndicator.tsx` | Zoom percentage display with preset dropdown (50%, 100%, 150%, 200%, Fit) |
| `src/lib/recorder.ts` | `RecordingEngine` class — WebRTC recording |
| `src/lib/upload.ts` | `uploadRecording()`, `registerReviewer()` |
| `src/state/recorderStore.ts` | Recording state machine |
| `src/state/annotationStore.ts` | Annotation tool state, snapshots synced to recording timeline |
| `src/state/sessionStore.ts` | `fetchSessionByToken()` |

**Technical implementation:**
- `fetchSessionByToken(shareToken)` calls `get_session_by_token()` RPC (SECURITY DEFINER, bypasses RLS for anonymous access)
- `registerReviewer(sessionId, name)`: checks/creates `browser_uuid` in localStorage, inserts into `reviewers`
- `PermissionsGate`: calls `navigator.mediaDevices.getUserMedia()` with constraints; catches `NotAllowedError` separately from device errors
- `RecordingEngine.start(stream)`: creates `MediaRecorder` — auto-detects video vs audio-only streams; video uses vp9/opus codec at 2.5Mbps, audio-only uses opus codec; 1s chunk interval
- Timer: `setInterval` every 500ms, calls `onDurationUpdate` with elapsed seconds
- Pause/resume: `MediaRecorder.pause()` / `.resume()`, tracks `pauseStart` and accumulates `pausedDuration`
- Auto-stop: if `maxDuration` set, engine checks elapsed against limit every timer tick
- Stop: `MediaRecorder.stop()` fires `ondataavailable` (final chunk) then `onstop`; chunks merged into Blob
- Preview: Blob --> `URL.createObjectURL()` --> `<video>` element playback
- Re-record: resets recorder state to `idle`, creates new engine
- Send: calls `uploadRecording(blob, sessionId, reviewerId, onProgress)`
- Upload progress milestones: 10% (start) --> 60% (upload complete) --> 80% (DB insert) --> 100% (edge function invoked)
- **Recording layout (artifact-first):** Artifact fills the screen via `AnnotationCanvas` (full height/width). Compact header bar shows session title + reviewer name. Recorder renders in `compact` mode as a thin bottom bar with inline status/timer/controls. If webcam is active, a small PiP thumbnail floats in the bottom-right corner. If audio-only, a small floating mic indicator appears instead. Annotation tools (ToolPalette, StickyToggle, ZoomIndicator) overlay the artifact canvas.
- **Compact Recorder mode:** When `compact={true}`, Recorder renders without the video feed — just a horizontal bar with: [REC/PAUSED indicator + timer] on the left, [action buttons] on the right. Preview playback expands above the bar when in preview state. Time-remaining progress bar renders as a thin strip above controls.
- **Canvas gesture handling:** `useAnnotationGestures` uses `@use-gesture/react` bound to the canvas container. Pinch-to-zoom via `onPinch`, two-finger drag to pan via `onDrag` (guarded by `touches > 1`), Ctrl/Cmd+scroll to zoom via `onWheel` (requires modifier key to prevent accidental zoom from trackpad momentum). Delta threshold of 0.5 filters noise.
- **Canvas resize stability:** `AnnotationCanvas` resize observer re-centers the artifact when the container resizes (iOS Safari URL bar, layout stabilization). Uses `bgDimensionsRef` and `fitZoomRef` to track canonical state. If user hasn't manually zoomed (within 2% of fit zoom), re-fits to new container. Otherwise preserves user zoom and only re-centers.

---

### Feature: "View Recordings and Transcripts"

**What it does:** Sender views a specific session's artifact alongside recordings and their AI-generated transcripts. Can click transcript segments to seek the video.

**User action:** Click session from dashboard. Select recording tab. Watch video. Click transcript timestamps to jump.

**Files touched:**
| File | Role |
|------|------|
| `src/pages/SessionDetail.tsx` | Split-panel layout: artifact + recordings/video/transcript |
| `src/components/ArtifactViewer.tsx` | PDF iframe or image display |
| `src/components/TranscriptPanel.tsx` | Transcript display with clickable timestamp segments |
| `src/state/sessionStore.ts` | `fetchSession()`, `fetchRecordings()`, `fetchTranscript()` |
| `src/lib/transcription.ts` | `pollTranscript()`, `formatTimestamp()` |

**Technical implementation:**
- `fetchRecordings(sessionId)`: queries `recordings` joined with `reviewers`, then creates signed URLs for each `video_url` path
- Signed URLs: `supabase.storage.from('recordings').createSignedUrl(path, 3600)` — 1-hour expiry
- Recording selector: pill buttons showing reviewer name, auto-selects first recording
- `fetchTranscript(recordingId)`: queries `transcripts` table, caches in store keyed by `recording_id`
- Transcript states: pending/processing (spinner), complete (segments), failed (error message)
- `pollTranscript()`: polls every 5 seconds, up to 30 attempts (2.5 min timeout), returns on `complete` or `failed`
- `formatTimestamp(seconds)`: converts to `M:SS` format (e.g., 65 --> "1:05")
- Timestamp click: `onTimestampClick(seconds)` --> `videoRef.current.currentTime = seconds`
- Transcript segments rendered as clickable buttons showing `[M:SS]` + text

---

### Feature: "Async Transcription"

**What it does:** After a recording is uploaded, a Supabase Edge Function sends the video to OpenAI Whisper and stores the resulting transcript with timestamped segments.

**User action:** None (automatic, triggered after reviewer sends recording).

**Files touched:**
| File | Role |
|------|------|
| `supabase/functions/transcribe/index.ts` | Edge function: download video, call Whisper, store transcript |
| `src/lib/upload.ts` | `uploadRecording()` invokes the edge function |
| `src/lib/transcription.ts` | `pollTranscript()` polls for completion on sender side |
| `supabase/migrations/001_initial.sql` | `recordings` and `transcripts` table definitions |

**Technical implementation:**
- Edge function triggered by: `supabase.functions.invoke('transcribe', { body: { recording_id, video_path } })`
- Uses `SUPABASE_SERVICE_ROLE_KEY` to access private `recordings` bucket
- Downloads video: `supabase.storage.from('recordings').download(video_path)`
- OpenAI call: `POST https://api.openai.com/v1/audio/transcriptions` with `FormData` containing the file
  - `model: 'whisper-1'`
  - `response_format: 'verbose_json'`
  - `timestamp_granularities[]: 'segment'`
- Segments transformed: `Math.floor(segment.start)`, `Math.floor(segment.end)`, `segment.text.trim()`
- Status transitions: recording `uploaded --> transcribing --> complete|failed`, transcript `processing --> complete|failed`
- Error handling: any failure marks both recording and transcript as `'failed'`
- Client-side: transcription is fire-and-forget from reviewer's perspective; sender polls on SessionDetail page

---

### Feature: "URL-Based Artifact Import"

**What it does:** Instead of uploading a file, the sender can paste a URL (Google Docs, Google Slides, or any public web page). The system fetches the content server-side, converts it to PDF (Google) or screenshot PNG (generic), and stores it in Supabase Storage.

**User action:** On `/new`, click "Paste URL" tab. Enter a URL. The detected URL type is shown (Google Doc, Slides, or web page). Click "Create Session". The edge function fetches and converts the artifact.

**Files touched:**
| File | Role |
|------|------|
| `src/pages/NewSession.tsx` | Segmented control (Upload file / Paste URL), URL input with validation |
| `src/state/sessionStore.ts` | `createSession()` accepts optional `artifactUrl`, calls `fetch-artifact` edge function |
| `src/types/index.ts` | `Session` interface extended with `source_url` and `source_type` |
| `supabase/functions/fetch-artifact/index.ts` | Edge function: URL detection, Google PDF export, Firecrawl screenshot, storage upload |
| `supabase/migrations/006_url_import_columns.sql` | Adds `source_url` and `source_type` columns to `sessions` |

**Technical implementation:**
- Client-side URL validation via regex: detects Google Docs (`/document/d/`), Google Slides (`/presentation/d/`), or generic
- Edge function `fetch-artifact` receives `{ url }`, detects type, fetches content:
  - Google Docs/Slides: `https://docs.google.com/.../export?format=pdf` — free, native PDF export
  - Generic URLs: Firecrawl API `POST /v2/scrape` with `formats: ["screenshot"]` — returns base64 PNG
- Private Google Docs detected by checking if export returns HTML instead of PDF (Content-Type check)
- Result uploaded to `artifacts` bucket at `{UUID}.{ext}` using service role key
- `artifact_type` set to `'pdf'` (Google) or `'image'` (screenshot) — reuses existing viewer logic
- `source_url` and `source_type` stored on session row for provenance tracking
- Edge function env vars: `FIRECRAWL_API_KEY` (new), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (existing)

---

## 10. Project Structure

```
/
├── src/
│   ├── main.tsx                    # Entry point, renders <App /> in #root
│   ├── App.tsx                     # BrowserRouter, ProtectedRoute, route definitions
│   ├── index.css                   # Tailwind v4 imports + design tokens (@theme)
│   ├── types/
│   │   └── index.ts                # All TypeScript interfaces: Session, Recording, Transcript, etc.
│   ├── lib/
│   │   ├── supabase.ts             # createClient() with env vars, singleton export
│   │   ├── recorder.ts             # RecordingEngine class: WebRTC MediaRecorder wrapper
│   │   ├── upload.ts               # uploadRecording(), registerReviewer()
│   │   └── transcription.ts        # pollTranscript(), formatTimestamp()
│   ├── state/
│   │   ├── authStore.ts            # Zustand: user, initialize(), signInWithGoogle(), signOut()
│   │   ├── sessionStore.ts         # Zustand: sessions[], CRUD, recordings, transcripts
│   │   ├── recorderStore.ts        # Zustand: recorder state machine, blob, duration, progress
│   │   └── annotationStore.ts      # Zustand: annotation snapshots, tools, recording sync
│   ├── pages/
│   │   ├── LandingPage.tsx         # Marketing landing page with Google OAuth sign-in
│   │   ├── Dashboard.tsx           # Session list: search, sort, stats, table/grid views
│   │   ├── NewSession.tsx          # Create session: drag-drop upload, form, success screen
│   │   ├── SessionDetail.tsx       # View recordings + transcripts, split-panel layout
│   │   └── ReviewLink.tsx          # Full reviewer flow: entry → onboarding → record → send
│   └── components/
│       ├── Layout.tsx              # App shell: header (logo, avatar, signout) + <Outlet />
│       ├── Recorder.tsx            # Recording UI: start/pause/stop/preview/send + timer (supports audio-only + compact mode)
│       ├── ArtifactViewer.tsx      # PDF iframe or image viewer (conditional render)
│       ├── UploadProgress.tsx      # Upload progress bar + success/error states
│       ├── TranscriptPanel.tsx     # Timestamped transcript with clickable segments
│       ├── OnboardingOverlay.tsx   # Multi-step onboarding overlay (permissions + mic test)
│       ├── OnboardingStepMicTest.tsx # Mic/camera test with camera toggle + skip option
│       ├── CountdownOverlay.tsx    # 3-2-1 countdown before recording starts
│       ├── EditSessionModal.tsx    # Modal to edit session title/context
│       └── annotation/
│           ├── AnnotationCanvas.tsx    # Fabric.js canvas: artifact background + drawing overlays + resize-safe re-centering
│           ├── AnnotationPlayback.tsx  # Annotation replay synced to video timeline (session detail page)
│           ├── useAnnotationGestures.ts # Pinch zoom, two-finger pan, Ctrl+scroll zoom via @use-gesture/react
│           ├── useAnnotationTools.ts   # Configures Fabric.js drawing/shape/eraser modes from annotation store
│           ├── ToolPalette.tsx         # Floating annotation toolbar: pen, circle, rect, eraser, select + sub-palettes
│           ├── StickyToggle.tsx        # Toggle button to enable/disable annotation drawing mode
│           └── ZoomIndicator.tsx       # Zoom % display with preset dropdown
├── supabase/
│   ├── migrations/
│   │   ├── 001_initial.sql         # Full schema: sessions, reviewers, recordings, transcripts + RLS
│   │   ├── 002_users_2ctake.sql    # users_2ctake table + auto-create trigger from auth.users
│   │   ├── 003_max_duration.sql    # Adds max_duration column to sessions
│   │   ├── 005_artifacts_storage_policies.sql # Storage bucket policies for artifacts
│   │   ├── 006_url_import_columns.sql  # Adds source_url, source_type to sessions
│   │   ├── 007_fix_reviewer_rls.sql    # Grants table-level permissions, baseline RLS
│   │   ├── 008_fix_rls_data_leak.sql   # Tightens RLS: scoped SELECT, get_session_by_token() RPC
│   │   └── 009_fix_storage_policies.sql # Tightens artifact storage: owner-only for auth, open for anon
│   └── functions/
│       ├── transcribe/
│       │   └── index.ts            # Edge function: download video → Whisper API → store transcript
│       └── fetch-artifact/
│           └── index.ts            # Edge function: URL → PDF/screenshot → storage upload
├── .env.example                    # Required env vars template
├── vite.config.ts                  # Vite + React + Tailwind plugins
└── package.json
```

---

## 11. State Architecture

### `authStore` (Zustand) — `src/state/authStore.ts`

```typescript
{
  user: User | null,          // { id, email, name, avatar_url }
  loading: boolean,           // true until initial session check completes
  error: string | null,
  initialize(): Promise<void>,        // getSession() + onAuthStateChange listener
  signInWithGoogle(): Promise<void>,   // supabase.auth.signInWithOAuth({ provider: 'google' })
  signOut(): Promise<void>             // supabase.auth.signOut()
}
```

### `sessionStore` (Zustand) — `src/state/sessionStore.ts`

```typescript
{
  sessions: Session[],                          // all user sessions (with recording_count)
  currentSession: Session | null,               // selected session for detail view
  recordings: Recording[],                      // recordings for currentSession
  transcripts: Record<string, Transcript>,      // keyed by recording_id, cached
  loading: boolean,
  error: string | null,
  fetchSessions(): Promise<void>,
  fetchSession(id: string): Promise<void>,
  fetchSessionByToken(token: string): Promise<Session | null>,
  createSession(data): Promise<Session | null>,
  updateSession(id: string, updates): Promise<string | null>,   // returns error or null
  fetchRecordings(sessionId: string): Promise<void>,
  fetchTranscript(recordingId: string): Promise<void>,
  deleteSession(id: string): Promise<void>
}
```

### `recorderStore` (Zustand) — `src/state/recorderStore.ts`

```typescript
{
  state: 'idle' | 'recording' | 'paused' | 'stopped' | 'preview' | 'uploading' | 'success' | 'error',
  mediaStream: MediaStream | null,
  recordedBlob: Blob | null,
  duration: number,               // elapsed seconds
  uploadProgress: number,         // 0-100
  error: string | null,
  setState(state): void,
  setMediaStream(stream): void,
  setRecordedBlob(blob): void,
  setDuration(seconds): void,
  setUploadProgress(pct): void,
  setError(err): void,            // also sets state='error'
  reset(): void                   // clears blob, duration, progress, error; sets state='idle'
}
```

### `annotationStore` (Zustand) — `src/state/annotationStore.ts`

Manages annotation canvas state during recording: active tool, stroke history, snapshot capture synced to recording timeline. Snapshots are uploaded alongside the recording blob and replayed on the session detail page.

---

## 12. Environment Variables

**Client-side** (in `.env`, exposed via Vite):
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

**Edge function** (set via Supabase dashboard or `supabase secrets set`):
```
OPENAI_API_KEY=sk-...
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

---

## 13. Design System

**Tailwind v4** with custom theme tokens defined in `src/index.css`:

| Token | Value | Usage |
|-------|-------|-------|
| `brand-50` to `brand-900` | Indigo scale | Primary actions, links, highlights (app UI) |
| `goblin-pink` | `#FF1493` | Landing page accent, annotations, branding |
| `goblin-green` | `#1DB954` | Landing page accent, success states, branding |
| `surface` | `#ffffff` | Card backgrounds |
| `surface-secondary` | `#f8fafc` | Page background |
| `surface-tertiary` | `#f1f5f9` | Subtle backgrounds, hover states |
| `border` | `#e2e8f0` | Borders |
| `text-primary` | `#0f172a` | Headings, body |
| `text-secondary` | `#475569` | Descriptions |
| `text-muted` | `#94a3b8` | Placeholders, timestamps |

**Font:** Inter, system-ui fallback

**Component patterns:**
- Cards: `rounded-xl border border-border bg-surface p-5`
- Buttons primary: `rounded-xl bg-brand-600 text-white hover:bg-brand-700`
- Buttons secondary: `rounded-xl border border-border bg-surface hover:bg-surface-tertiary`
- Inputs: `rounded-xl border border-border px-4 py-3 focus:border-brand-400 focus:ring-2 focus:ring-brand-100`

---

## 14. MVP Cutline

### Shipped
- PDF/image artifact upload
- Mic + camera recording with pause/resume/re-record (supports audio-only mode)
- Camera toggle (reviewers can disable camera during onboarding)
- Preview before send
- Upload with progress tracking
- Async transcription via OpenAI Whisper with timestamped segments
- Dashboard with session cards, search, sort, table/grid views
- Session detail with video playback + clickable timestamped transcript
- Google OAuth for senders
- Anonymous reviewer flow (no login, name entry only)
- Multi-step onboarding overlay with mic test (skip option)
- Edit session title/context
- Configurable recording time limit
- Copy share link to clipboard
- URL-based artifact import (Google Docs, Google Slides, generic web pages via Firecrawl)
- Interactive annotation canvas for reviewer markup (synced to recording timeline)
- Marketing landing page with scroll-reveal animations
- Tightened RLS: scoped multi-tenant data access, SECURITY DEFINER RPC for share-token lookup

### NOT shipped (future)
- Screen share recording
- AI analysis / insights beyond transcription
- Team features / multi-sender
- Billing / paywall
- Email magic link auth
- Re-record after upload failure (currently must restart)
- Multiple recordings per reviewer visit

---

## 15. Extension Points & Implementation Guides

When adding features, update this doc. Below are implementation guides for common extensions.

### Add a new page
1. Create component in `src/pages/`
2. Add route in `App.tsx` — inside `<Layout>` for protected, outside for public
3. Wrap with `<ProtectedRoute>` if auth required
4. Add to the Routes table in this document (Section 7)

### Add a new DB table
1. Create numbered migration in `supabase/migrations/` (e.g., `004_new_table.sql`)
2. Add TypeScript interface in `src/types/index.ts`
3. Add RLS policies in the migration
4. Update this document's Database Schema section (Section 6)
5. If the table has FK cascades, document them in the entity relationship diagram

### Modify recording flow
1. Update `RecordingEngine` in `src/lib/recorder.ts` for low-level changes
2. Update `recorderStore` state machine if new states are added
3. Update `Recorder.tsx` component controls for UI changes
4. Update `ReviewLink.tsx` page if flow steps change
5. Update the Recording Lifecycle diagram in this document (Section 8)

### Add a new artifact type
1. Add to `artifact_type` check constraint in a new migration
2. Update `ArtifactViewer.tsx` to handle the new type
3. Update `NewSession.tsx` file input `accept` attribute
4. Update `sessionStore.createSession()` type detection logic

### Add screen share recording
1. Extend `RecordingEngine` to call `navigator.mediaDevices.getDisplayMedia()`
2. Merge display stream with camera stream (or replace video track)
3. Add UI toggle in `Recorder.tsx`
4. Update `ReviewLink.tsx` to offer the choice before recording starts

### Add AI analysis beyond transcription
1. Create new edge function in `supabase/functions/`
2. Create new DB table for analysis results (migration + types)
3. Add component in `SessionDetail.tsx` to display results
4. Wire invocation: either chain after transcription or trigger manually from UI

### Add billing / paywall
1. Integrate Stripe (or similar) — add server-side edge function for webhooks
2. Create `subscriptions` table with migration
3. Gate `sessionStore.createSession()` on active subscription
4. Add billing page/component

---

## 16. Supabase Setup Checklist

1. Create Supabase project (or use existing shared instance)
2. Enable Google OAuth in Authentication --> Providers
3. Run migrations in order: `001_initial.sql`, `002_users_2ctake.sql`, `003_max_duration.sql`
4. Create storage buckets: `artifacts` (public), `recordings` (private)
5. Set storage policies:
   - `artifacts`: authenticated users can upload, public read
   - `recordings`: anyone can upload, service role read (private)
6. Deploy edge function: `supabase functions deploy transcribe`
7. Set edge function secrets: `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
8. Copy project URL and anon key to `.env`

---

## 17. Security Model

| Boundary | Protection | Implementation |
|----------|-----------|----------------|
| Sender authentication | Google OAuth JWT | Supabase Auth, `ProtectedRoute` component |
| Session access control | RLS policies + RPC | Owner CRUD, share-token lookup via `get_session_by_token()` SECURITY DEFINER RPC (no public SELECT) |
| Recording privacy | Private storage bucket | Signed URLs (1hr expiry) for owner, service role for edge function |
| Reviewer isolation | No auth, no cross-visibility | Each reviewer only sees their own recording flow |
| Artifact access | Public bucket | Anyone with URL can view (by design — artifacts are shared content) |
| API access | Supabase anon key + RLS | RLS enforces row-level access; anon key allows unauthenticated reviewer operations |
| Edge function secrets | Environment variables | `OPENAI_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` set via Supabase dashboard |

---

## 18. Common Operations Quick Reference

| I want to... | Do this |
|--------------|---------|
| Add a page | `src/pages/` + route in `App.tsx` + Section 7 |
| Add a component | `src/components/` + import where needed |
| Add a DB table | Migration + `src/types/index.ts` + Section 6 |
| Add a Zustand store | `src/state/` + Section 11 |
| Add a lib utility | `src/lib/` + import where needed |
| Add an edge function | `supabase/functions/{name}/index.ts` + deploy |
| Add a storage bucket | Supabase dashboard + policies + Section 16 |
| Change the design tokens | `src/index.css` @theme block + Section 13 |
| Add a feature | Implement + add to Feature Catalog (Section 9) |

---

*Last updated: 2026-02-26 (Artifact-first recording layout, compact recorder mode, canvas drift fix, Ctrl+scroll zoom guard, annotation toolbar overlay)*
*Update this file whenever you make structural changes to the codebase.*
