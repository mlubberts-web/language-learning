-- The AI helper next to the theory (PLAN 9.12): how many questions each person asked today.
-- Run this once in Supabase: SQL Editor > New query > paste > Run. It can be run again safely.
--
-- Nobody can read or change the table directly. The website's server part (worker/index.js)
-- calls ai_use_one() with the person's own login before every question: it counts the question
-- and refuses when the person has no access or already asked 50 questions today.

create table if not exists public.ai_usage (
  user_id    uuid not null references auth.users on delete cascade,
  day        date not null,
  questions  integer not null default 0,
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;

-- Counts one question for the person logged in. Returns how many they asked today.
-- Errors: NOT_LOGGED_IN, NO_ACCESS, DAILY_LIMIT (then nothing is counted).
create or replace function public.ai_use_one() returns integer
language plpgsql security definer set search_path = public as $$
declare
  used integer;
begin
  if auth.uid() is null then raise exception 'NOT_LOGGED_IN'; end if;
  if not public.has_access() then raise exception 'NO_ACCESS'; end if;
  insert into ai_usage (user_id, day, questions) values (auth.uid(), current_date, 1)
    on conflict (user_id, day) do update set questions = ai_usage.questions + 1
    returning questions into used;
  if used > 50 then raise exception 'DAILY_LIMIT'; end if; -- the error undoes the count
  return used;
end $$;

-- How many questions the person logged in asked today (for "38 of 50 left today").
create or replace function public.ai_used_today() returns integer
language sql stable security definer set search_path = public as $$
  select coalesce((select questions from ai_usage where user_id = auth.uid() and day = current_date), 0);
$$;

revoke all on function public.ai_use_one() from public, anon;
revoke all on function public.ai_used_today() from public, anon;
grant execute on function public.ai_use_one() to authenticated;
grant execute on function public.ai_used_today() to authenticated;
