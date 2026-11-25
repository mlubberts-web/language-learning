-- Sets up the database of the new website. Run it once in Supabase: SQL Editor, New query,
-- paste all of this, Run. Running it again is safe: it only adds what is missing.
--
-- What it makes:
--   invite_codes  the codes people need to make an account (you add them on the admin page)
--   profiles      one row per account: name, "has access", admin or not
--   results       everyone's results, one row per course part, like "es_from_en_practice"
-- Row level security: the website can only read and write the rows of the person logged in.
-- Payments later only have to set has_access (and access_until) in profiles.

-- ---------- invite codes ----------
create table if not exists public.invite_codes (
  code        text primary key,
  note        text,                      -- who it is for, for yourself
  uses        integer not null default 0,
  max_uses    integer,                   -- empty: no limit
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
alter table public.invite_codes enable row level security;  -- no policies: only the functions below read it

-- ---------- profiles ----------
create table if not exists public.profiles (
  id            uuid primary key references auth.users on delete cascade,
  display_name  text,
  has_access    boolean not null default false,
  access_until  date,                    -- for payments later; empty: no end date
  invite_code   text,
  is_admin      boolean not null default false,
  created_at    timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles for select using (auth.uid() = id);

-- Whether the person logged in may use the site now
create or replace function public.has_access() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select has_access and (access_until is null or access_until >= current_date)
                   from profiles where id = auth.uid()), false);
$$;

-- ---------- results ----------
create table if not exists public.results (
  user_id     uuid not null references auth.users on delete cascade,
  name        text not null,             -- like "es_from_en_practice" or "profile"
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  primary key (user_id, name)
);
alter table public.results enable row level security;
drop policy if exists "own results" on public.results;
create policy "own results" on public.results for all
  using (auth.uid() = user_id and public.has_access())
  with check (auth.uid() = user_id and public.has_access());

-- ---------- a new account needs a valid invite code ----------
-- The website sends the code along with the sign-up; a wrong code stops the sign-up.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  given text := trim(coalesce(new.raw_user_meta_data->>'invite_code', ''));
  found text;
begin
  update invite_codes set uses = uses + 1
   where lower(code) = lower(given) and active and (max_uses is null or uses < max_uses)
   returning code into found;
  if found is null then
    raise exception 'INVALID_INVITE_CODE';
  end if;
  insert into profiles (id, display_name, invite_code, has_access)
  values (new.id, nullif(trim(new.raw_user_meta_data->>'name'), ''), found, true);
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- deleting your own account (with all your results) ----------
create or replace function public.delete_my_account() returns void
language sql security definer set search_path = public as $$
  delete from auth.users where id = auth.uid();
$$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ---------- the admin page ----------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false);
$$;

create or replace function public.admin_users()
returns table (id uuid, email text, display_name text, has_access boolean, access_until date,
               invite_code text, is_admin boolean, created_at timestamptz, last_sign_in_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  return query
    select p.id, u.email::text, p.display_name, p.has_access, p.access_until, p.invite_code, p.is_admin,
           p.created_at, u.last_sign_in_at
      from profiles p join auth.users u on u.id = p.id
     order by p.created_at desc;
end;
$$;

create or replace function public.admin_set_access(person uuid, allowed boolean, until date)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  update profiles set has_access = allowed, access_until = until where id = person;
end;
$$;

create or replace function public.admin_invite_codes()
returns setof public.invite_codes language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  return query select * from invite_codes order by created_at desc;
end;
$$;

create or replace function public.admin_save_invite_code(new_code text, new_note text, new_max_uses integer, is_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  insert into invite_codes (code, note, max_uses, active) values (trim(new_code), new_note, new_max_uses, is_active)
  on conflict (code) do update set note = excluded.note, max_uses = excluded.max_uses, active = excluded.active;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['admin_users()', 'admin_set_access(uuid, boolean, date)', 'admin_invite_codes()',
                           'admin_save_invite_code(text, text, integer, boolean)']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
