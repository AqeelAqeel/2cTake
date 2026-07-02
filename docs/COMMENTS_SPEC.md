# Product Spec — Reviewer Comments (Docs-style pins, highlights & voice notes)

**Anchored to:** `docs/current-state.md` + `docs/AGENTS_LLM_PRODUCT.md` · **Status:** ✅ Shipped (migration 012). Built on ✅ annotation canvas (Fabric.js), ✅ webcam recording + timestamped playback, ✅ Whisper transcription. 🔜 R2 storage migration (behind `VITE_USE_R2`).

## Problem
Reviewers can scribble on the artifact and talk over it, but they can't leave a **discrete, addressable note** — "this paragraph is wrong," "love this." Free-form ink and a continuous monologue force the sender to scrub the whole video to find the one reaction that mattered. Reviewers want the Google-Docs reflex: tap a spot (or highlight a region), drop a comment, keep going — without breaking their recording or their train of thought.

## Bet
If we ship anchored text + voice comments that a reviewer can drop **without interrupting their recording**, then reviewers will leave **≥2 discrete comments per take** within the first 2 weeks, and senders will open a take's **comment list before scrubbing the video**, measured by comment-creation events and comment-panel interactions in PostHog.

## Success criteria
- [x] A **comment icon** (`MessageSquarePlus`) toggles comment mode on the artifact, with a live count badge.
- [x] **Desktop & mobile:** tap an artifact spot → pin comment; drag over a region → highlight comment.
- [x] Comment composer offers **text typing** and an **inline mic-dictate** button; voice comments store **both the audio clip and a Whisper transcript** (plus optional live SpeechRecognition preview while speaking).
- [x] Mic dictation taps the **already-open recording audio track** (`recorderStore.mediaStream`) via a second short-lived `MediaRecorder` — it **never calls `getUserMedia` again**; the main webcam recording continues uninterrupted.
- [x] Each comment is **hybrid-anchored**: a spatial anchor on the artifact (normalized 0..1 coords) **and** a recording-timeline offset.
- [x] Comments render as **pins/highlights glued to the artifact** through zoom/pan/resize; reviewer can re-read or delete before sending.
- [x] On the sender's `SessionDetail`: a **Comments tab** lists each comment with anchor type, reviewer, transcript/text, an **audio player** for voice notes, and a **timestamp that seeks the video**; the active comment highlights in sync during playback.
- [x] Works anonymously through the existing `share_token` flow; persisted at send time alongside the recording.

## Evaluation
- **Metric:** Comments per submitted take (text vs voice) + sender comment-panel engagement.
- **Kill:** <0.5 comments/take after 2 weeks → pull the icon, keep annotations.
- **Scale:** ≥2 comments/take **and** senders open comments before video on >40% of takes → invest in threading/replies.
- **Graduate:** Sustained ≥2/take for 4 weeks with no recording-mic regressions.

## Scope & build anchors
- **In:** reviewer comment creation (text + voice) during recording; hybrid anchor + timeline; sender-side comment list with seek + audio playback.
- **Out (now):** sender-authored comments, reviewer↔sender threading/replies, editing a comment after send, comment notifications, on-artifact comment pins on the *sender* playback canvas (list-only today).
- **Reuses:** `AnnotationCanvas` (canvas + viewport transform), `recorderStore.mediaStream`, `transcribe` edge fn + Whisper, `recordings` bucket + `/api/r2-presign-upload` (new `comment` kind), `presignDownload`/signed URLs, `get_session_by_token` anon flow.
- **New:** `comments` table + migration `012_comments.sql`; `src/types/comment.ts`; `src/state/commentStore.ts`; `src/lib/commentDictation.ts`; `persistComments()` in `src/lib/upload.ts`; `src/components/comments/` (`CommentLayer`, `CommentComposer`, `CommentToggle`); `fetchComments()` in `sessionStore`; `CommentsPanel` in `SessionDetail`.

## Security
- The reviewer (anon) has **no direct access** to the `comments` table. Writes go through the
  `add_comment()` SECURITY DEFINER RPC keyed on `share_token` (validates token → session → reviewer
  → recording). There is no anon SELECT — comments are buffered client-side, and only the
  authenticated session owner reads them (RLS join to `sessions`). This avoids the `USING (true)`
  anon-SELECT cross-tenant leak — and migration **013** retro-fixes the same class on
  `recordings`/`reviewers` (drops anon SELECT/INSERT, moves writes to `register_reviewer()` /
  `create_recording()` RPCs), so the anonymous reviewer now has zero direct table access.

## Preflight before applying migrations (different Supabase account on this machine)
This machine's Supabase CLI is logged into a different account than the one owning the real 2cTake
schema, so apply migrations **via the Supabase SQL editor** (browser, correct account). First confirm
you're on the right project — this must return all four rows:
```sql
select table_name from information_schema.tables
where table_schema='public'
  and table_name in ('reviewers','recordings','transcripts','users_2ctake')
order by table_name;
```
Then paste `supabase/migrations/012_comments.sql` then `013_lock_down_anon_writes.sql`, and deploy the
`transcribe` edge function from the correct account.

## Notes / follow-ups
- **Live dictation text** uses the browser `SpeechRecognition` API when available (best-effort); the stored audio clip + async Whisper transcript are the source of truth.
- **Sender on-artifact pins** are deferred — the playback canvas (`AnnotationPlayback`) would need to expose its viewport transform to position React pins. The Comments list (with seek + audio) is the shipped consumption surface.
- Comments are immutable once a take is sent (matches "no re-record after upload").
