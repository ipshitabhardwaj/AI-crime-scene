-- =====================================================================
-- The AI Files: Decode the Crime — initial schema
-- Run once in Supabase: SQL Editor -> paste this file -> Run
-- (or `supabase db push` if you use the Supabase CLI)
-- =====================================================================

-- ---------- Enums ----------------------------------------------------
create type public.app_role        as enum ('admin', 'judge', 'team');
create type public.event_phase     as enum ('waiting', 'investigation', 'initial_locked',
                                            'twist', 'final', 'closed', 'presentations', 'results');
create type public.evidence_type   as enum ('log', 'chat', 'email', 'db', 'api', 'code',
                                            'screenshot', 'ai_output', 'note');
create type public.evidence_tag    as enum ('relevant', 'irrelevant', 'misleading');
create type public.submission_stage as enum ('initial', 'final');

-- ---------- Event setup ----------------------------------------------
create table public.event (
  id                int primary key default 1 check (id = 1),   -- exactly one row
  name              text not null default 'The AI Files: Decode the Crime',
  phase             public.event_phase not null default 'waiting',
  phase_ends_at     timestamptz,
  twist_released_at timestamptz,
  updated_at        timestamptz not null default now()
);
insert into public.event (id) values (1);

create table public.cases (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null unique,                 -- e.g. CASE-A
  title              text not null,
  briefing_md        text not null default '',
  root_cause_options text[] not null default '{}',
  created_at         timestamptz not null default now()
);

-- Twist text lives in its own table so teams cannot read it early.
create table public.case_twists (
  case_id  uuid primary key references public.cases(id) on delete cascade,
  twist_md text not null default ''
);

create table public.evidence (
  id          uuid primary key default gen_random_uuid(),
  case_id     uuid not null references public.cases(id) on delete cascade,
  code        text not null,                               -- e.g. E07
  type        public.evidence_type not null,
  title       text not null,
  time_label  text,                                        -- fictional in-story time, shown to teams
  content     jsonb not null default '{}'::jsonb,           -- shape depends on type
  is_twist    boolean not null default false,
  sort_order  int not null default 0,
  unique (case_id, code)
);
create index on public.evidence (case_id);

create table public.answer_key (
  case_id                uuid primary key references public.cases(id) on delete cascade,
  root_cause_category    text not null,
  root_cause_md          text not null default '',
  responsible            text not null default '',
  post_twist_category    text not null,
  post_twist_responsible text not null default ''
);

create table public.answer_evidence (
  evidence_id  uuid primary key references public.evidence(id) on delete cascade,
  tag          public.evidence_tag not null,
  timeline_pos int                                            -- null = not in the correct timeline
);

-- ---------- People ---------------------------------------------------
create table public.teams (
  id            uuid primary key default gen_random_uuid(),
  team_code     text not null unique,                        -- AIF-001
  name          text not null,
  institution   text,
  members       jsonb not null default '[]'::jsonb,          -- [{name, email?, phone?}]
  contact_email text,
  contact_phone text,
  case_id       uuid references public.cases(id) on delete set null,
  auth_user_id  uuid unique references auth.users(id) on delete set null,
  checked_in    boolean not null default false,
  extra_minutes int not null default 0,
  is_dummy      boolean not null default false,
  source_row    jsonb,                                       -- raw registration-form row
  created_at    timestamptz not null default now()
);
create unique index teams_contact_email_key on public.teams (lower(contact_email))
  where contact_email is not null;

-- PINs are kept separately so only admins can read them (for reprinting slips).
create table public.team_credentials (
  team_id    uuid primary key references public.teams(id) on delete cascade,
  pin        text not null,
  updated_at timestamptz not null default now()
);

create table public.profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  role         public.app_role not null,
  team_id      uuid references public.teams(id) on delete cascade,
  display_name text,
  check ((role = 'team') = (team_id is not null))
);

-- ---------- Team work ------------------------------------------------
create table public.evidence_tags (
  team_id     uuid not null references public.teams(id) on delete cascade,
  evidence_id uuid not null references public.evidence(id) on delete cascade,
  tag         public.evidence_tag,
  note        text not null default '',
  updated_at  timestamptz not null default now(),
  primary key (team_id, evidence_id)
);

create table public.timeline_entries (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams(id) on delete cascade,
  stage       public.submission_stage not null,
  position    int not null,
  evidence_id uuid references public.evidence(id) on delete set null,
  time_label  text not null default '',
  description text not null default '',
  updated_at  timestamptz not null default now()
);
create index on public.timeline_entries (team_id, stage, position);

create table public.submissions (
  team_id             uuid not null references public.teams(id) on delete cascade,
  stage               public.submission_stage not null,
  what_happened       text not null default '',
  root_cause_category text,
  root_cause_md       text not null default '',
  responsible         text not null default '',
  key_evidence        text[] not null default '{}',          -- evidence codes
  fix_md              text not null default '',
  tags_snapshot       jsonb,                                  -- tags frozen at lock time
  submitted_at        timestamptz,
  locked              boolean not null default false,
  updated_at          timestamptz not null default now(),
  primary key (team_id, stage)
);

-- ---------- Judging --------------------------------------------------
create table public.judge_assignments (
  judge_id uuid not null references public.profiles(user_id) on delete cascade,
  team_id  uuid not null references public.teams(id) on delete cascade,
  primary key (judge_id, team_id)
);

create table public.auto_scores (
  team_id      uuid primary key references public.teams(id) on delete cascade,
  tagging      numeric not null default 0,   -- out of 15
  timeline     numeric not null default 0,   -- out of 15
  root_cause   numeric not null default 0,   -- out of 10 (category part)
  adaptability numeric not null default 0,   -- out of 10
  total        numeric generated always as (tagging + timeline + root_cause + adaptability) stored,
  computed_at  timestamptz not null default now()
);

create table public.judge_scores (
  judge_id  uuid not null references public.profiles(user_id) on delete cascade,
  team_id   uuid not null references public.teams(id) on delete cascade,
  criterion text not null check (criterion in
              ('responsible', 'reasoning', 'evidence_based', 'presentation')),
  score     numeric not null check (score between 0 and 10),
  comment   text not null default '',
  updated_at timestamptz not null default now(),
  primary key (judge_id, team_id, criterion)
);

create table public.shortlist (
  team_id            uuid primary key references public.teams(id) on delete cascade,
  presentation_order int,
  final_rank         int
);

-- =====================================================================
-- Helper functions (security definer = they bypass RLS, so policies
-- can call them without recursion)
-- =====================================================================
create or replace function public.my_role() returns public.app_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where user_id = auth.uid()
$$;

create or replace function public.my_team_id() returns uuid
language sql stable security definer set search_path = public as $$
  select team_id from public.profiles where user_id = auth.uid()
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() = 'admin', false)
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() in ('admin', 'judge'), false)
$$;

create or replace function public.my_case_id() returns uuid
language sql stable security definer set search_path = public as $$
  select case_id from public.teams where id = public.my_team_id()
$$;

create or replace function public.case_open() returns boolean
language sql stable security definer set search_path = public as $$
  select phase <> 'waiting' from public.event where id = 1
$$;

create or replace function public.twist_released() returns boolean
language sql stable security definer set search_path = public as $$
  select twist_released_at is not null from public.event where id = 1
$$;

-- Can the current team write work for this stage right now?
-- initial -> only during 'investigation'; final -> during 'twist' or 'final'.
-- Deadline = phase_ends_at + this team's extra_minutes.
create or replace function public.can_write(p_stage public.submission_stage) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select
      (case p_stage
         when 'initial' then e.phase = 'investigation'
         when 'final'   then e.phase in ('twist', 'final')
       end)
      and (e.phase_ends_at is null
           or now() < e.phase_ends_at + make_interval(mins => t.extra_minutes))
    from public.event e, public.teams t
    where e.id = 1 and t.id = public.my_team_id()
  ), false)
$$;

create or replace function public.can_write_any() returns boolean
language sql stable security definer set search_path = public as $$
  select public.can_write('initial') or public.can_write('final')
$$;

-- Server clock, so browser timers can correct for wrong laptop clocks.
create or replace function public.server_now() returns timestamptz
language sql stable as $$ select now() $$;

-- =====================================================================
-- Row-level security
-- Admin tools use the service-role key (bypasses RLS); the "admin all"
-- policies below also let a logged-in admin work from the browser.
-- =====================================================================
alter table public.event             enable row level security;
alter table public.cases             enable row level security;
alter table public.case_twists       enable row level security;
alter table public.evidence          enable row level security;
alter table public.answer_key        enable row level security;
alter table public.answer_evidence   enable row level security;
alter table public.teams             enable row level security;
alter table public.team_credentials  enable row level security;
alter table public.profiles          enable row level security;
alter table public.evidence_tags     enable row level security;
alter table public.timeline_entries  enable row level security;
alter table public.submissions       enable row level security;
alter table public.judge_assignments enable row level security;
alter table public.auto_scores       enable row level security;
alter table public.judge_scores      enable row level security;
alter table public.shortlist         enable row level security;

-- event: everyone (including the public projector page) can read.
create policy event_read  on public.event for select to anon, authenticated using (true);
create policy event_admin on public.event for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- cases: staff see all; a team sees only its own case, once the case is open.
create policy cases_staff on public.cases for select to authenticated using (public.is_staff());
create policy cases_team  on public.cases for select to authenticated
  using (id = public.my_case_id() and public.case_open());
create policy cases_admin on public.cases for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- case_twists: staff always; a team only after the twist is released.
create policy twists_staff on public.case_twists for select to authenticated using (public.is_staff());
create policy twists_team  on public.case_twists for select to authenticated
  using (case_id = public.my_case_id() and public.twist_released());
create policy twists_admin on public.case_twists for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- evidence: team sees its case's evidence once open; twist items only after release.
create policy evidence_staff on public.evidence for select to authenticated using (public.is_staff());
create policy evidence_team  on public.evidence for select to authenticated
  using (case_id = public.my_case_id() and public.case_open()
         and (not is_twist or public.twist_released()));
create policy evidence_admin on public.evidence for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- answer keys: staff only. Teams have no policy -> no access.
create policy answer_key_staff on public.answer_key for select to authenticated using (public.is_staff());
create policy answer_key_admin on public.answer_key for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy answer_ev_staff on public.answer_evidence for select to authenticated using (public.is_staff());
create policy answer_ev_admin on public.answer_evidence for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- teams: a team reads its own row; staff read all; admins write.
create policy teams_self  on public.teams for select to authenticated using (id = public.my_team_id());
create policy teams_staff on public.teams for select to authenticated using (public.is_staff());
create policy teams_admin on public.teams for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- team_credentials: admins only.
create policy creds_admin on public.team_credentials for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- profiles: everyone reads their own; admins manage all.
create policy profiles_self  on public.profiles for select to authenticated using (user_id = auth.uid());
create policy profiles_staff on public.profiles for select to authenticated using (public.is_staff());
create policy profiles_admin on public.profiles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- evidence_tags: own rows only; writes only while a writing phase is open.
create policy tags_read   on public.evidence_tags for select to authenticated
  using (team_id = public.my_team_id() or public.is_staff());
create policy tags_insert on public.evidence_tags for insert to authenticated
  with check (team_id = public.my_team_id() and public.can_write_any());
create policy tags_update on public.evidence_tags for update to authenticated
  using (team_id = public.my_team_id()) with check (team_id = public.my_team_id() and public.can_write_any());
create policy tags_delete on public.evidence_tags for delete to authenticated
  using (team_id = public.my_team_id() and public.can_write_any());

-- timeline_entries: own rows; write only for the stage that is open.
create policy tl_read   on public.timeline_entries for select to authenticated
  using (team_id = public.my_team_id() or public.is_staff());
create policy tl_insert on public.timeline_entries for insert to authenticated
  with check (team_id = public.my_team_id() and public.can_write(stage));
create policy tl_update on public.timeline_entries for update to authenticated
  using (team_id = public.my_team_id() and public.can_write(stage))
  with check (team_id = public.my_team_id() and public.can_write(stage));
create policy tl_delete on public.timeline_entries for delete to authenticated
  using (team_id = public.my_team_id() and public.can_write(stage));

-- submissions: own rows; writable only while its stage is open and not locked.
create policy sub_read   on public.submissions for select to authenticated
  using (team_id = public.my_team_id() or public.is_staff());
create policy sub_insert on public.submissions for insert to authenticated
  with check (team_id = public.my_team_id() and public.can_write(stage) and not locked);
create policy sub_update on public.submissions for update to authenticated
  using (team_id = public.my_team_id() and public.can_write(stage) and not locked)
  with check (team_id = public.my_team_id() and public.can_write(stage));

-- judging tables
create policy ja_read  on public.judge_assignments for select to authenticated
  using (judge_id = auth.uid() or public.is_admin());
create policy ja_admin on public.judge_assignments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy auto_staff on public.auto_scores for select to authenticated using (public.is_staff());
create policy auto_admin on public.auto_scores for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy js_read  on public.judge_scores for select to authenticated
  using (judge_id = auth.uid() or public.is_admin());
create policy js_write on public.judge_scores for insert to authenticated
  with check (judge_id = auth.uid() and exists (
    select 1 from public.judge_assignments a where a.judge_id = auth.uid() and a.team_id = judge_scores.team_id));
create policy js_update on public.judge_scores for update to authenticated
  using (judge_id = auth.uid()) with check (judge_id = auth.uid());
create policy js_admin on public.judge_scores for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy shortlist_staff on public.shortlist for select to authenticated using (public.is_staff());
create policy shortlist_admin on public.shortlist for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- =====================================================================
-- Realtime: broadcast changes to the event row (phase, deadline, twist)
-- =====================================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.event;
  end if;
end $$;
