# 2cTake — AI Developer Onboarding & System Map

> **What is this?** A living document for any AI SWE agent working on this codebase. Read this first. It contains the product model, current implementation state, architecture, database schema, data flows, and extension points. Update this file when you make structural changes.

---

## 1. Product Summary

**2cTake** is an async artifact feedback recorder. A sender uploads a PDF or image, generates a shareable link, and reviewers open that link to record video+audio reactions. The sender then watches recordings and reads AI-generated transcripts.

**Core flow:** Upload artifact → Share link → Reviewer records → Sender reviews

**Category:** Private async cognition capture over artifacts. Not Loom, not Zoom, not Figma.

---

## 2. User Model

| Role | Auth | Capabilities |
|------|------|-------------|
| **Sender** | Google OAuth via Supabase | Creates sessions, uploads artifacts, shares links, reviews recordings, reads transcripts |
| **Reviewer** | None (anonymous) | Enters name, records video+audio feedback, submits. Cannot return or see other reviewers |

**Key constraint:** Reviewers are completely isolated. No collaboration. No login. Private pipeline.

---

## 3. Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Vite + React 19 + TypeScript |
| Styling | Tailwind CSS v4 (via `@tailwindcss/vite` plugin) |
| State | Zustand |
| Routing | React Router v7 |
| Auth | Supabase Auth (Google OAuth) |
| Database | Supabase PostgreSQL |
| Storage | Supabase Storage (buckets: `artifacts`, `recordings`) |
| Transcription | OpenAI Whisper via Supabase Edge Function |
| Icons | Lucide React |

---

## 4. Project Structure

```
/
├── src/
│   ├── main.tsx                    # Entry point
│   ├── App.tsx                     # Router + auth guard
│   ├── index.css                   # Tailwind imports + design tokens
│   ├── types/
│   │   └── index.ts                # All TypeScript interfaces
│   ├── lib/
│   │   ├── supabase.ts             # Supabase client init
│   │   ├── recorder.ts             # MediaRecorder engine class
│   │   ├── upload.ts               # Upload service + reviewer registration
│   │   └── transcription.ts        # Transcript polling + formatting
│   ├── state/
│   │   ├── authStore.ts            # Auth state (Zustand)
│   │   ├── sessionStore.ts         # Session CRUD + recordings + transcripts
│   │   └── recorderStore.ts        # Recorder state machine
│   ├── pages/
│   │   ├── Login.tsx               # Google OAuth login
│   │   ├── Dashboard.tsx           # Session list (sender)
│   │   ├── NewSession.tsx          # Create session form
│   │   ├── SessionDetail.tsx       # View recordings + transcripts
│   │   └── ReviewLink.tsx          # Full reviewer flow (entry → record → send)
│   └── components/
│       ├── Layout.tsx              # App shell (header + outlet)
│       ├── Recorder.tsx            # Recording UI (start/pause/stop/preview/send)
│       ├── ArtifactViewer.tsx      # PDF iframe or image viewer
│       ├── UploadProgress.tsx      # Upload progress/success/error states
│       ├── TranscriptPanel.tsx     # Timestamped transcript display
│       └── PermissionsGate.tsx     # Camera/mic permission request
├── supabase/
│   ├── migrations/
│   │   ├── 001_initial.sql         # Full schema + RLS policies
│   │   └── 002_users_2ctake.sql    # users_2ctake table + auto-create trigger
│   └── functions/
│       └── transcribe/
│           └── index.ts            # Edge function: video → Whisper → transcript
├── .env.example                    # Required env vars
├── vite.config.ts                  # Vite + React + Tailwind plugins
└── package.json
```

---

## 5. Database Schema

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
| owner_id | uuid | FK → auth.users(id), cascade delete |
| title | text | Required |
| context | text | Optional instructions for reviewers |
| artifact_url | text | Public URL to uploaded artifact |
| artifact_type | text | `'pdf'` or `'image'` |
| share_token | text | Unique, used in review URL |
| created_at | timestamptz | Auto |

### `reviewers`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| session_id | uuid | FK → sessions(id) |
| name | text | Entered by reviewer |
| browser_uuid | text | Stored in localStorage for device tracking |
| created_at | timestamptz | Auto |

### `recordings`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| session_id | uuid | FK → sessions(id) |
| reviewer_id | uuid | FK → reviewers(id) |
| video_url | text | Public URL to webm |
| audio_url | text | Nullable (future: extracted audio) |
| duration | integer | Seconds |
| status | text | `uploading → uploaded → transcribing → complete → failed` |
| created_at | timestamptz | Auto |

### `transcripts`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| recording_id | uuid | FK → recordings(id), unique |
| text | text | Full transcript text |
| timestamps_json | jsonb | Array of `{ start, end, text }` segments |
| status | text | `pending → processing → complete → failed` |
| created_at | timestamptz | Auto |

### RLS Policies
- **Sessions:** Owner full CRUD. Anyone can SELECT (needed for share_token lookup).
- **Reviewers:** Anyone can INSERT. Owner can SELECT their session's reviewers.
- **Recordings:** Anyone can INSERT/UPDATE. Owner can SELECT.
- **Transcripts:** Anyone can INSERT/UPDATE. Owner can SELECT via recordings→sessions join.

---

## 6. Routes

| Path | Component | Auth | Description |
|------|-----------|------|-------------|
| `/login` | Login | Public | Google OAuth |
| `/` | Dashboard | Protected | Session list |
| `/new` | NewSession | Protected | Create session form |
| `/session/:id` | SessionDetail | Protected | View recordings + transcripts |
| `/review/:shareToken` | ReviewLink | Public | Full reviewer flow |

---

## 7. State Architecture

### `authStore` (Zustand)
- `user`, `loading`, `error`
- `initialize()` — restores session from Supabase, subscribes to auth changes
- `signInWithGoogle()` — triggers OAuth redirect
- `signOut()`

### `sessionStore` (Zustand)
- `sessions[]`, `currentSession`, `recordings[]`, `transcripts{}`
- CRUD operations against Supabase
- `fetchSessionByToken()` — used by reviewer flow

### `recorderStore` (Zustand)
- State machine: `idle → recording → paused → stopped → preview → uploading → success → error`
- `mediaStream`, `recordedBlob`, `duration`, `uploadProgress`

---

## 8. Recording Engine

**Class:** `RecordingEngine` in `src/lib/recorder.ts`

- Uses `MediaRecorder` API with `video/webm;codecs=vp9,opus`
- 1-second chunk buffering (`start(1000)`)
- Pause/resume support with accurate duration tracking
- Callbacks: `onDurationUpdate`, `onStop`, `onError`
- Nothing uploads until user presses Send

**Recording lifecycle state machine:**
```
idle → recording → paused → resumed → stopped → preview → send → uploading → success
```

---

## 9. Data Flow

```
Reviewer device
  ↓ MediaRecorder API (video/webm)
Local recording (chunked in memory)
  ↓ User presses SEND
Upload to Supabase Storage (recordings bucket)
  ↓
Insert recording row (status: uploaded)
  ↓
Invoke Edge Function: transcribe
  ↓
Edge Function:
  1. Fetch video from storage
  2. POST to OpenAI Whisper API
  3. Parse segments
  4. Update transcript row (status: complete)
  5. Update recording row (status: complete)
  ↓
Sender dashboard shows recording + transcript
```

---

## 10. Environment Variables

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Edge function env vars (set via Supabase dashboard):
```
OPENAI_API_KEY=sk-...
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

---

## 11. Supabase Setup Checklist

1. Create Supabase project
2. Enable Google OAuth in Authentication → Providers
3. Run `001_initial.sql` migration
4. Create storage buckets: `artifacts` (public), `recordings` (public)
5. Set storage policies:
   - `artifacts`: authenticated users can upload, public read
   - `recordings`: anyone can upload, public read
6. Deploy edge function: `supabase functions deploy transcribe`
7. Set edge function secrets: `OPENAI_API_KEY`
8. Copy project URL and anon key to `.env`

---

## 12. Design System

**Tailwind v4** with custom theme tokens defined in `src/index.css`:

| Token | Value | Usage |
|-------|-------|-------|
| `brand-50` to `brand-900` | Indigo scale | Primary actions, links, highlights |
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

## 13. MVP Cutline

### Shipped
- PDF/image artifact upload
- Mic + camera recording
- Pause/resume/re-record
- Preview before send
- Upload with progress
- Async transcription via OpenAI Whisper
- Dashboard with session cards
- Session detail with video playback + timestamped transcript
- Google OAuth for senders
- Anonymous reviewer flow

### NOT shipped (future)
- Markup overlays on artifacts
- Screen share recording
- AI analysis / insights
- Team features / multi-sender
- Billing / paywall
- Email magic link auth

---

## 14. Extension Points

When adding features, update this doc. Key areas for extension:

1. **New artifact types** → Update `artifact_type` check constraint, `ArtifactViewer` component
2. **Screen share** → Extend `RecordingEngine` to capture `getDisplayMedia`, merge streams
3. **AI insights** → Add new edge function, new DB table, new component in SessionDetail
4. **Billing** → Add Stripe integration, `subscriptions` table, gate in `sessionStore.createSession`
5. **Team features** → Add `teams` table, update `sessions.owner_id` to support team membership

---

## 15. Common Operations

### Add a new page
1. Create component in `src/pages/`
2. Add route in `App.tsx`
3. Wrap with `ProtectedRoute` if auth required

### Add a new DB table
1. Create migration in `supabase/migrations/`
2. Add TypeScript interface in `src/types/index.ts`
3. Add RLS policies
4. Update this document's schema section

### Modify recording flow
1. Update `RecordingEngine` in `src/lib/recorder.ts`
2. Update `recorderStore` state machine
3. Update `Recorder` component controls
4. Update `ReviewLink` page if flow steps change

---

*Last updated: 2026-02-16*
*Update this file whenever you make structural changes to the codebase.*
