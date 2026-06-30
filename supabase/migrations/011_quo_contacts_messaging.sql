-- 011: Quo texting — contacts, message templates, and a message log
--
-- Adds the data model behind the new /contacts route and the Quo SMS
-- integration:
--   * contacts          — a sender's address book (name + E.164 phone)
--   * message_templates — reusable text bodies with {{link}} {{name}} {{sender}}
--   * messages_log      — every outbound/inbound SMS, so we can COUNT messages
--                         sent to and from each owner/conversation.
--
-- RLS: everything is owner-scoped (auth.uid() = owner_id). Server-side
-- pipelines (the /api/quo-* Vercel functions and the inbound webhook) use the
-- service_role key, which bypasses RLS — so no permissive client policies are
-- needed for INSERT from those paths.

-- ── contacts ──────────────────────────────────────────────────────────────
create table public.contacts (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  name          text not null,
  phone         text not null,                       -- E.164, e.g. +14155550123
  confirmed     boolean not null default false,      -- sender confirmed the number
  notes         text,
  created_at    timestamptz not null default now(),
  unique (owner_id, phone)
);

create index idx_contacts_owner on public.contacts(owner_id);

alter table public.contacts enable row level security;

create policy "contacts: owner full access"
  on public.contacts for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- ── message_templates ──────────────────────────────────────────────────────
create table public.message_templates (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  body        text not null,    -- supports {{link}}, {{name}}, {{sender}}
  created_at  timestamptz not null default now()
);

create index idx_message_templates_owner on public.message_templates(owner_id);

alter table public.message_templates enable row level security;

create policy "templates: owner full access"
  on public.message_templates for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- ── messages_log ────────────────────────────────────────────────────────────
-- One row per SMS in either direction. owner_id is the sender's user id; for
-- inbound messages it's resolved by matching the Quo sender number back to one
-- of the owner's contacts (may be null if no match). This table is the source
-- of truth for the "messages to / from" counts shown on the Contacts page.
create table public.messages_log (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid references auth.users(id) on delete cascade,
  session_id          uuid references public.sessions(id) on delete set null,
  contact_id          uuid references public.contacts(id) on delete set null,
  direction           text not null check (direction in ('outgoing', 'incoming')),
  quo_message_id      text,
  quo_conversation_id text,
  from_number         text,
  to_number           text,
  content             text,
  status              text,
  created_at          timestamptz not null default now()
);

create index idx_messages_log_owner on public.messages_log(owner_id);
create index idx_messages_log_conversation on public.messages_log(quo_conversation_id);
create index idx_messages_log_contact on public.messages_log(contact_id);

alter table public.messages_log enable row level security;

-- Owners can read their own message history. Inserts happen server-side via
-- the service_role key (Vercel functions / inbound webhook), which bypasses RLS.
create policy "messages_log: owner can read"
  on public.messages_log for select
  to authenticated
  using (owner_id = auth.uid());
