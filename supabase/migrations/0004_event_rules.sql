-- =====================================================================
-- 0004 — event rules round (run AFTER 0001–0003). Safe to re-run.
--
--  1. app_schema_version: lets anyone check which migrations are applied.
--  2. Initial conclusion = a recorded hypothesis. Submitting it locks the
--     initial REPORT only; tags and the initial timeline stay editable until
--     the official lock (admin_lock_stage), which is now recorded per row
--     in submissions.admin_locked.
--  3. Extra time: teams.phase_extra_minutes applies to ONE phase only
--     (teams.phase_extra_phase); teams.extra_minutes is the explicit
--     whole-event extension.
--  4. Auto-score columns for the new 50-point rules (hypothesis + evidence
--     support replace adaptability).
--  5. Judges see only their assigned teams (work, case, answer key), and
--     only once submissions are closed. Judges score only in Closed /
--     Presentations. Admin access is unchanged.
--  6. verify_installation() / verify_max_rows(): production self-checks
--     (service role only), used by `npm run verify:prod`.
-- =====================================================================

-- ---------- 1. schema version -----------------------------------------
create table if not exists public.app_schema_version (
  version    int primary key,
  applied_at timestamptz not null default now(),
  note       text not null default ''
);
alter table public.app_schema_version enable row level security;   -- no policies: server only
revoke all on public.app_schema_version from anon, authenticated;
insert into public.app_schema_version (version, note) values
  (1, '0001_init'), (2, '0002_event_operations'), (3, '0003_hardening'), (4, '0004_event_rules')
on conflict (version) do nothing;

-- ---------- 2. official lock recorded per submission ------------------
alter table public.submissions add column if not exists admin_locked boolean not null default false;

-- Existing databases: rows of a stage whose phase is already over count as officially locked.
update public.submissions set admin_locked = true
 where stage = 'initial' and not admin_locked
   and (select phase from public.event where id = 1) not in ('waiting', 'investigation');
update public.submissions set admin_locked = true
 where stage = 'final' and not admin_locked
   and (select phase from public.event where id = 1) in ('closed', 'presentations', 'results');

-- ---------- 3. extra time per phase -----------------------------------
alter table public.teams add column if not exists phase_extra_minutes int not null default 0;
alter table public.teams add column if not exists phase_extra_phase public.event_phase;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'teams_phase_extra_range') then
    alter table public.teams add constraint teams_phase_extra_range check (phase_extra_minutes between 0 and 120);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'teams_extra_range') then
    alter table public.teams add constraint teams_extra_range check (extra_minutes between 0 and 120) not valid;
  end if;
end $$;

-- Minutes added to the current deadline for a team: whole-event extension
-- plus the extension given for the phase that is running right now.
create or replace function public.team_extra_minutes(p_team uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((
    select t.extra_minutes
         + case when t.phase_extra_phase = e.phase then t.phase_extra_minutes else 0 end
    from public.teams t, public.event e
    where e.id = 1 and t.id = p_team
  ), 0)
$$;

revoke all on function public.team_extra_minutes(uuid) from public, anon, authenticated;   -- used inside security-definer functions only

-- Reports: phase open, before the team's deadline, and not submitted/locked.
create or replace function public.can_write(p_stage public.submission_stage) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select
      (case p_stage
         when 'initial' then e.phase = 'investigation'
         when 'final'   then e.phase in ('twist', 'final')
       end)
      and (e.phase_ends_at is null
           or now() < e.phase_ends_at + make_interval(mins => public.team_extra_minutes(t.id)))
      and not exists (select 1 from public.submissions s
                      where s.team_id = t.id and s.stage = p_stage and s.locked)
    from public.event e, public.teams t
    where e.id = 1 and t.id = public.my_team_id()
  ), false)
$$;

-- Investigation work (tags, timeline):
--   initial stage: Investigation phase, before the deadline, until the OFFICIAL
--                  lock — submitting the initial hypothesis does not stop it;
--   final stage:   same as the final report (submitting the final report ends it).
create or replace function public.can_work(p_stage public.submission_stage) returns boolean
language sql stable security definer set search_path = public as $$
  select case p_stage
    when 'initial' then coalesce((
      select e.phase = 'investigation'
         and (e.phase_ends_at is null
              or now() < e.phase_ends_at + make_interval(mins => public.team_extra_minutes(t.id)))
         and not exists (select 1 from public.submissions s
                         where s.team_id = t.id and s.stage = 'initial' and s.admin_locked)
      from public.event e, public.teams t
      where e.id = 1 and t.id = public.my_team_id()
    ), false)
    else public.can_write('final')
  end
$$;

create or replace function public.can_write_any() returns boolean
language sql stable security definer set search_path = public as $$
  select public.can_work('initial') or public.can_work('final')
$$;

create or replace function public.save_tag(p_evidence uuid, p_tag public.evidence_tag, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v_team uuid := public.my_team_id();
begin
  if v_team is null then raise exception 'NOT_TEAM' using errcode = '42501'; end if;
  perform public._team_write_lock(v_team);
  if not (public.can_work('initial') or public.can_work('final')) then
    raise exception 'CLOSED' using errcode = '42501';
  end if;
  if not public.evidence_visible(p_evidence) then
    raise exception 'INVALID_EVIDENCE' using errcode = '22023';
  end if;
  insert into public.evidence_tags (team_id, evidence_id, tag, note, updated_at)
  values (v_team, p_evidence, p_tag, left(coalesce(p_note, ''), 2000), now())
  on conflict (team_id, evidence_id)
  do update set tag = excluded.tag, note = excluded.note, updated_at = now();
end $$;

create or replace function public.save_timeline(p_stage public.submission_stage, p_entries jsonb, p_base int)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_team uuid := public.my_team_id();
  v_ver int;
  e jsonb;
begin
  if v_team is null then raise exception 'NOT_TEAM' using errcode = '42501'; end if;
  perform public._team_write_lock(v_team);
  if not public.can_work(p_stage) then raise exception 'CLOSED' using errcode = '42501'; end if;
  if jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) > 60 then
    raise exception 'INVALID_TIMELINE' using errcode = '22023';
  end if;
  for e in select * from jsonb_array_elements(p_entries) loop
    if jsonb_typeof(e) <> 'object' then raise exception 'INVALID_TIMELINE' using errcode = '22023'; end if;
    if nullif(e->>'evidence_id', '') is not null
       and not public.evidence_visible((e->>'evidence_id')::uuid) then
      raise exception 'INVALID_EVIDENCE' using errcode = '22023';
    end if;
  end loop;

  v_ver := public._claim_version(v_team, 'timeline_' || p_stage, p_base);

  delete from public.timeline_entries where team_id = v_team and stage = p_stage;
  insert into public.timeline_entries (team_id, stage, position, evidence_id, time_label, description)
  select v_team, p_stage, x.ord,
         nullif(x.item->>'evidence_id', '')::uuid,
         left(coalesce(x.item->>'time_label', ''), 60),
         left(coalesce(x.item->>'description', ''), 500)
  from jsonb_array_elements(p_entries) with ordinality as x(item, ord);
  return v_ver;
end $$;

-- Official lock: waits for in-flight saves, locks every row of the stage and
-- marks it admin_locked. Initial-stage tag snapshots are refreshed (teams may
-- keep tagging after submitting their hypothesis); final snapshots taken at
-- submission are kept. Returns the number of drafts auto-locked.
create or replace function public.admin_lock_stage(p_stage public.submission_stage) returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
  t uuid;
begin
  for t in select id from public.teams order by id loop
    perform pg_advisory_xact_lock(hashtext('team:' || t::text));
  end loop;

  insert into public.submissions (team_id, stage)
  select tm.id, p_stage from public.teams tm where tm.auth_user_id is not null
  on conflict (team_id, stage) do nothing;

  update public.submissions s
     set locked = true,            -- submitted_at stays null = "auto-locked, never submitted"
         updated_at = now()
   where s.stage = p_stage and not s.locked;
  get diagnostics n = row_count;

  update public.submissions s
     set admin_locked = true,
         tags_snapshot = case when p_stage = 'initial' or s.tags_snapshot is null
                              then public.team_tags_json(s.team_id) else s.tags_snapshot end
   where s.stage = p_stage and not s.admin_locked;
  return n;
end $$;
revoke all on function public.admin_lock_stage(public.submission_stage) from public, anon, authenticated;

create or replace function public.admin_reset_event() returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.shortlist;
  delete from public.judge_scores;
  delete from public.judge_assignments;
  delete from public.auto_scores;
  delete from public.submissions;
  delete from public.timeline_entries;
  delete from public.evidence_tags;
  delete from public.work_versions;
  delete from public.login_attempts;
  update public.teams set extra_minutes = 0, phase_extra_minutes = 0, phase_extra_phase = null;
  update public.event
     set phase = 'waiting', phase_ends_at = null, twist_released_at = null, updated_at = now()
   where id = 1;
end $$;
revoke all on function public.admin_reset_event() from public, anon, authenticated;

-- Control-room status (return type changed: drop first).
drop function if exists public.admin_team_status();
create function public.admin_team_status()
returns table (
  team_id uuid, team_code text, name text, case_code text, checked_in boolean, is_dummy boolean,
  extra_minutes int, phase_extra_minutes int, has_login boolean, tags int, tl_initial int, tl_final int,
  initial_state text, final_state text, last_activity timestamptz
) language sql stable security definer set search_path = public as $$
  select t.id, t.team_code, t.name, c.code, t.checked_in, t.is_dummy, t.extra_minutes,
         case when t.phase_extra_phase = (select phase from event where id = 1) then t.phase_extra_minutes else 0 end,
         t.auth_user_id is not null,
         (select count(*) from evidence_tags g where g.team_id = t.id and g.tag is not null)::int,
         (select count(*) from timeline_entries x where x.team_id = t.id and x.stage = 'initial')::int,
         (select count(*) from timeline_entries x where x.team_id = t.id and x.stage = 'final')::int,
         (select case when s.submitted_at is not null then 'submitted' when s.locked then 'auto-locked' else 'draft' end
            from submissions s where s.team_id = t.id and s.stage = 'initial'),
         (select case when s.submitted_at is not null then 'submitted' when s.locked then 'auto-locked' else 'draft' end
            from submissions s where s.team_id = t.id and s.stage = 'final'),
         greatest(
           (select max(updated_at) from evidence_tags g where g.team_id = t.id),
           (select max(updated_at) from work_versions w where w.team_id = t.id)
         )
  from teams t left join cases c on c.id = t.case_id
  order by t.team_code
$$;
revoke all on function public.admin_team_status() from public, anon, authenticated;

-- ---------- 4. auto-score columns --------------------------------------
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'auto_scores' and column_name = 'adaptability') then
    alter table public.auto_scores drop column total;
    alter table public.auto_scores drop column adaptability;
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'auto_scores' and column_name = 'hypothesis') then
    alter table public.auto_scores add column hypothesis numeric not null default 0;          -- out of 6
    alter table public.auto_scores add column evidence_support numeric not null default 0;    -- out of 6
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'auto_scores' and column_name = 'total') then
    alter table public.auto_scores add column total numeric
      generated always as (tagging + timeline + hypothesis + root_cause + evidence_support) stored;
  end if;
end $$;
comment on column public.auto_scores.tagging is 'out of 15';
comment on column public.auto_scores.timeline is 'out of 15';
comment on column public.auto_scores.hypothesis is 'out of 6: initial category already correct';
comment on column public.auto_scores.root_cause is 'out of 8: final category correct';
comment on column public.auto_scores.evidence_support is 'out of 6: cited pre-twist evidence';

-- ---------- 5. judge access --------------------------------------------
create or replace function public.judging_open() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select phase in ('closed', 'presentations', 'results') from public.event where id = 1), false)
$$;

create or replace function public.judge_sees_team(p_team uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_role() = 'judge' and public.judging_open()
     and exists (select 1 from public.judge_assignments a where a.judge_id = auth.uid() and a.team_id = p_team)
$$;

create or replace function public.judge_sees_case(p_case uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_role() = 'judge' and public.judging_open()
     and exists (select 1 from public.judge_assignments a join public.teams t on t.id = a.team_id
                 where a.judge_id = auth.uid() and t.case_id = p_case)
$$;

create or replace function public.judge_sees_evidence(p_evidence uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.evidence e where e.id = p_evidence and public.judge_sees_case(e.case_id))
$$;

drop policy if exists cases_staff on public.cases;
create policy cases_staff on public.cases for select to authenticated
  using (public.is_admin() or public.judge_sees_case(id));
drop policy if exists twists_staff on public.case_twists;
create policy twists_staff on public.case_twists for select to authenticated
  using (public.is_admin() or public.judge_sees_case(case_id));
drop policy if exists evidence_staff on public.evidence;
create policy evidence_staff on public.evidence for select to authenticated
  using (public.is_admin() or public.judge_sees_case(case_id));
drop policy if exists answer_key_staff on public.answer_key;
create policy answer_key_staff on public.answer_key for select to authenticated
  using (public.is_admin() or public.judge_sees_case(case_id));
drop policy if exists answer_ev_staff on public.answer_evidence;
create policy answer_ev_staff on public.answer_evidence for select to authenticated
  using (public.is_admin() or public.judge_sees_evidence(evidence_id));
drop policy if exists teams_staff on public.teams;
create policy teams_staff on public.teams for select to authenticated
  using (public.is_admin() or public.judge_sees_team(id));
drop policy if exists profiles_staff on public.profiles;
create policy profiles_staff on public.profiles for select to authenticated
  using (public.is_admin());
drop policy if exists tags_read on public.evidence_tags;
create policy tags_read on public.evidence_tags for select to authenticated
  using (team_id = public.my_team_id() or public.is_admin() or public.judge_sees_team(team_id));
drop policy if exists tl_read on public.timeline_entries;
create policy tl_read on public.timeline_entries for select to authenticated
  using (team_id = public.my_team_id() or public.is_admin() or public.judge_sees_team(team_id));
drop policy if exists sub_read on public.submissions;
create policy sub_read on public.submissions for select to authenticated
  using (team_id = public.my_team_id() or public.is_admin() or public.judge_sees_team(team_id));
drop policy if exists wv_read on public.work_versions;
create policy wv_read on public.work_versions for select to authenticated
  using (team_id = public.my_team_id() or public.is_admin());
drop policy if exists auto_staff on public.auto_scores;
create policy auto_staff on public.auto_scores for select to authenticated
  using (public.is_admin() or public.judge_sees_team(team_id));
drop policy if exists shortlist_staff on public.shortlist;
create policy shortlist_staff on public.shortlist for select to authenticated
  using (public.is_admin() or public.judge_sees_team(team_id));

-- Judges score assigned teams, only while judging is running (not after the reveal).
create or replace function public.judge_may_score(p_team uuid, p_criterion text) returns boolean
language sql stable security definer set search_path = public as $$
  select (select phase in ('closed', 'presentations') from public.event where id = 1)
     and exists (select 1 from public.judge_assignments a where a.judge_id = auth.uid() and a.team_id = p_team)
     and (p_criterion <> 'presentation' or exists (select 1 from public.shortlist s where s.team_id = p_team))
$$;

-- ---------- 6. production self-checks ------------------------------------
-- Returns n rows; the API's "Max rows" setting caps what actually comes back.
create or replace function public.verify_max_rows(p_n int) returns setof int
language sql stable as $$
  select generate_series(1, least(greatest(p_n, 1), 5000))
$$;

create or replace function public.verify_installation()
returns table (check_name text, ok boolean, detail text)
language plpgsql stable security definer set search_path = public as $$
declare
  missing text;
begin
  check_name := 'schema version';
  select coalesce(max(version), 0) >= 4, 'applied: ' || coalesce(string_agg(version::text, ',' order by version), 'none')
    into ok, detail from public.app_schema_version;
  return next;

  check_name := 'row-level security on every public table';
  select string_agg(c.relname, ', ') into missing
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  ok := missing is null; detail := coalesce('RLS OFF: ' || missing, 'all tables'); return next;

  check_name := 'required functions';
  select string_agg(f, ', ') into missing from unnest(array[
    'public.can_write(public.submission_stage)', 'public.can_work(public.submission_stage)',
    'public.team_extra_minutes(uuid)', 'public.save_tag(uuid,public.evidence_tag,text)',
    'public.save_timeline(public.submission_stage,jsonb,integer)', 'public.save_report(public.submission_stage,jsonb,integer)',
    'public.submit_report(public.submission_stage,jsonb,integer)', 'public.admin_lock_stage(public.submission_stage)',
    'public.admin_prepare_final()', 'public.admin_reset_event()', 'public.admin_team_status()',
    'public.judge_may_score(uuid,text)', 'public.judge_sees_team(uuid)', 'public.record_login_failure(text,integer,integer,integer)'
  ]) as f where to_regprocedure(f) is null;
  ok := missing is null; detail := coalesce('missing: ' || missing, 'all present'); return next;

  -- Re-running an OLDER migration (e.g. 0002) after this one silently brings back old function bodies.
  check_name := 'functions are the 0004 versions';
  select string_agg(f, ', ') into missing from (values
    ('can_write', 'team_extra_minutes'),
    ('can_work', 'admin_locked'),
    ('save_tag', 'can_work'),
    ('save_timeline', 'can_work'),
    ('admin_lock_stage', 'admin_locked'),
    ('admin_reset_event', 'phase_extra_minutes'),
    ('judge_may_score', 'presentations')
  ) as v(f, marker)
   where not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'public' and p.proname = v.f and p.prosrc like '%' || v.marker || '%');
  ok := missing is null; detail := coalesce('outdated (re-run 0004): ' || missing, 'current'); return next;

  check_name := 'teams cannot write work tables directly';
  select string_agg(r || ' ' || p || ' ' || t, ', ') into missing
    from unnest(array['anon', 'authenticated']) r,
         unnest(array['INSERT', 'UPDATE', 'DELETE']) p,
         unnest(array['public.evidence_tags', 'public.timeline_entries', 'public.submissions', 'public.work_versions']) t
   where exists (select 1 from pg_roles where rolname = r) and has_table_privilege(r, t, p);
  ok := missing is null; detail := coalesce('still granted: ' || missing, 'revoked'); return next;

  check_name := 'answer keys: no participant or anonymous policy';
  select string_agg(policyname, ', ') into missing from pg_policies
   where schemaname = 'public' and tablename in ('answer_key', 'answer_evidence')
     and ('anon' = any(roles) or 'public' = any(roles) or coalesce(qual, '') ilike '%my_team_id%'
          or coalesce(qual, '') ilike '%is_staff%');
  ok := missing is null; detail := coalesce('check policies: ' || missing, 'admin + assigned judges (after close) only'); return next;

  check_name := 'admin functions not callable by users';
  select string_agg(f, ', ') into missing from unnest(array[
    'public.admin_lock_stage(public.submission_stage)', 'public.admin_prepare_final()', 'public.admin_reset_event()',
    'public.admin_team_status()', 'public.record_login_failure(text,integer,integer,integer)', 'public.verify_installation()'
  ]) f, unnest(array['anon', 'authenticated']) r
   where to_regprocedure(f) is not null and exists (select 1 from pg_roles where rolname = r)
     and has_function_privilege(r, f, 'EXECUTE');
  ok := missing is null; detail := coalesce('executable: ' || missing, 'service role only'); return next;

  check_name := 'indexes';
  select string_agg(w.want, ', ') into missing from (values
    ('evidence(case_id)', 'evidence', 'case_id'),
    ('timeline_entries(team_id, stage, position)', 'timeline_entries', 'team_id, stage, "?position"?'),
    ('evidence_tags(team_id)', 'evidence_tags', 'team_id'),
    ('judge_scores(team_id)', 'judge_scores', 'team_id'),
    ('judge_assignments(team_id)', 'judge_assignments', 'team_id'),
    ('teams(case_id)', 'teams', 'case_id')
  ) as w(want, tbl, cols_re)
   where not exists (select 1 from pg_indexes i
                     where i.schemaname = 'public' and i.tablename = w.tbl
                       and i.indexdef ~* ('USING btree \(' || w.cols_re || '[,)]'));
  ok := missing is null; detail := coalesce('missing: ' || missing, 'present'); return next;

  check_name := 'event row';
  ok := exists (select 1 from public.event where id = 1);
  select 'phase: ' || phase::text into detail from public.event where id = 1;
  detail := coalesce(detail, 'missing'); return next;
end $$;
revoke all on function public.verify_installation() from public, anon, authenticated;
revoke all on function public.verify_max_rows(int) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.admin_team_status() to service_role;
    grant execute on function public.admin_lock_stage(public.submission_stage) to service_role;
    grant execute on function public.admin_reset_event() to service_role;
    grant execute on function public.verify_installation() to service_role;
    grant execute on function public.verify_max_rows(int) to service_role;
    grant all on public.app_schema_version to service_role;
  end if;
end $$;
