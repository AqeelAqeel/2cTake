create table public.users_2ctake (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_users_2ctake_email on public.users_2ctake(email);

alter table public.users_2ctake enable row level security;

create policy "Users can read own profile"
  on public.users_2ctake for select
  to authenticated
  using (id = auth.uid());

create policy "Users can update own profile"
  on public.users_2ctake for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create or replace function public.handle_2ctake_new_user()
returns trigger as $$
begin
  insert into public.users_2ctake (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update set
    email = excluded.email,
    display_name = coalesce(excluded.display_name, public.users_2ctake.display_name),
    avatar_url = coalesce(excluded.avatar_url, public.users_2ctake.avatar_url),
    updated_at = now();
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created_2ctake
  after insert on auth.users
  for each row execute function public.handle_2ctake_new_user();

create trigger on_auth_user_updated_2ctake
  after update on auth.users
  for each row execute function public.handle_2ctake_new_user();

insert into public.users_2ctake (id, email, display_name, avatar_url)
select
  id,
  email,
  coalesce(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name'),
  raw_user_meta_data->>'avatar_url'
from auth.users
on conflict (id) do nothing;
