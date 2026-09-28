-- =====================================================================
-- The AI Files — step 3: pre-event hardening
-- Run AFTER 0001 and 0002: SQL Editor -> paste this file -> Run.
-- Safe to run more than once.
--
-- What it changes:
--  1. Team writes (tags, timeline, report, submit) go through checked
--     functions instead of direct table writes. Teams can no longer set
--     submitted_at / locked / tags_snapshot themselves, write evidence of
--     another case, or write hidden twist evidence.
--  2. Once a stage is submitted, that stage's timeline and tags are frozen.
--  3. Timeline and report saves carry a version number, so two teammates
--     editing on two laptops cannot silently overwrite each other.
--  4. Submitting is idempotent: a retried/duplicate submit returns the
--     original submission time instead of failing or changing it.
--  5. Judges can only score teams assigned to them (also on update) and
--     presentation scores only for shortlisted teams.
--  6. admin_team_status(): one query for the live control-room table.
--  7. login_attempts: throttles PIN guessing per team code.
--  8. admin_reset_event() also clears versions and login throttles.
-- =====================================================================

-- ---------- 2. can_write: also closed once that stage is submitted ----
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
      and not exists (select 1 from public.submissions s
                      where s.team_id = t.id and s.stage = p_stage and s.locked)
    from public.event e, public.teams t
    where e.id = 1 and t.id = public.my_team_id()
  ), false)
$$;

-- Evidence the current team is allowed to reference right now.
create or replace function public.evidence_visible(p_evidence uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.evidence e
    where e.id = p_evidence
      and e.case_id = public.my_case_id()
      and public.case_open()
      and (not e.is_twist or public.twist_released())
  )
$$;

-- ---------- 3. versions for optimistic concurrency --------------------
create table if not exists public.work_versions (
  team_id    uuid not null references public.teams(id) on delete cascade,
  doc        text not null check (doc in ('timeline_initial', 'timeline_final', 'report_initial', 'report_final')),
  version    int  not null default 0,
  updated_at timestamptz not null default now(),
  primary key (team_id, doc)
);
alter table public.work_versions enable row level security;
drop policy if exists wv_read on public.work_versions;
create policy wv_read on public.work_versions for select to authenticated
  using (team_id = public.my_team_id() or public.is_staff());

-- Bump (and lock) a version row; raises CONFLICT if the caller's base is stale.
create or replace function public._claim_version(p_team uuid, p_doc text, p_base int) returns int
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  insert into public.work_versions (team_id, doc) values (p_team, p_doc) on conflict do nothing;
  select version into v from public.work_versions where team_id = p_team and doc = p_doc for update;
  if p_base is not null and v <> p_base then
    raise exception 'CONFLICT' using errcode = 'P0001';
  end if;
  update public.work_versions set version = v + 1, updated_at = now() where team_id = p_team and doc = p_doc;
  return v + 1;
end $$;

-- Team writes hold a SHARED per-team lock; admin_lock_stage takes it EXCLUSIVELY.
-- So a lock waits for in-flight saves to finish, and any save that starts
-- afterwards re-checks can_write() and sees the lock. Nothing slips through.
create or replace function public._team_write_lock(p_team uuid) returns void
language sql volatile security definer set search_path = public as $$
  select pg_advisory_xact_lock_shared(hashtext('team:' || p_team::text))
$$;
revoke all on function public._team_write_lock(uuid) from public, anon, authenticated;

-- ---------- 1. team write functions ------------------------------------
create or replace function public.save_tag(p_evidence uuid, p_tag public.evidence_tag, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v_team uuid := public.my_team_id();
begin
  if v_team is null then raise exception 'NOT_TEAM' using errcode = '42501'; end if;
  perform public._team_write_lock(v_team);
  if not (public.can_write('initial') or public.can_write('final')) then
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

-- p_entries: [{"evidence_id": uuid|null, "time_label": "..", "description": ".."}, ...]
create or replace function public.save_timeline(p_stage public.submission_stage, p_entries jsonb, p_base int)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_team uuid := public.my_team_id();
  v_ver int;
  e jsonb;
begin
  if v_team is null then raise exception 'NOT_TEAM' using errcode = '42501'; end if;
  perform public._team_write_lock(v_team);
  if not public.can_write(p_stage) then raise exception 'CLOSED' using errcode = '42501'; end if;
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

-- p_fields: {what_happened, root_cause_category, root_cause_md, responsible, key_evidence[], fix_md}
create or replace function public.save_report(p_stage public.submission_stage, p_fields jsonb, p_base int)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_team uuid := public.my_team_id();
  v_ver int;
  v_keys text[];
  v_rows int;
begin
  if v_team is null then raise exception 'NOT_TEAM' using errcode = '42501'; end if;
  perform public._team_write_lock(v_team);
  if not public.can_write(p_stage) then raise exception 'CLOSED' using errcode = '42501'; end if;
  if jsonb_typeof(p_fields) <> 'object' then raise exception 'INVALID_REPORT' using errcode = '22023'; end if;
  select coalesce(array_agg(left(k, 20)), '{}') into v_keys
    from (select jsonb_array_elements_text(coalesce(p_fields->'key_evidence', '[]'::jsonb)) as k limit 50) s;

  v_ver := public._claim_version(v_team, 'report_' || p_stage, p_base);

  insert into public.submissions (team_id, stage, what_happened, root_cause_category, root_cause_md,
                                  responsible, key_evidence, fix_md, updated_at)
  values (v_team, p_stage,
          left(coalesce(p_fields->>'what_happened', ''), 5000),
          nullif(left(coalesce(p_fields->>'root_cause_category', ''), 200), ''),
          left(coalesce(p_fields->>'root_cause_md', ''), 5000),
          left(coalesce(p_fields->>'responsible', ''), 500),
          v_keys,
          left(coalesce(p_fields->>'fix_md', ''), 5000),
          now())
  on conflict (team_id, stage) do update set
    what_happened = excluded.what_happened,
    root_cause_category = excluded.root_cause_category,
    root_cause_md = excluded.root_cause_md,
    responsible = excluded.responsible,
    key_evidence = excluded.key_evidence,
    fix_md = excluded.fix_md,
    updated_at = now()
  where not public.submissions.locked;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then raise exception 'CLOSED' using errcode = '42501'; end if;   -- locked meanwhile
  return v_ver;
end $$;

-- Save + lock. Idempotent: if this stage is already submitted, returns the
-- original submission time (so a retried click is harmless).
create or replace function public.submit_report(p_stage public.submission_stage, p_fields jsonb, p_base int)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  v_team uuid := public.my_team_id();
  v_done timestamptz;
begin
  if v_team is null then raise exception 'NOT_TEAM' using errcode = '42501'; end if;
  -- Serialise submits of the same team+stage (two laptops / double click at the same instant).
  perform pg_advisory_xact_lock(hashtext('submit:' || v_team::text || ':' || p_stage::text));
  perform public._team_write_lock(v_team);
  select submitted_at into v_done from public.submissions
   where team_id = v_team and stage = p_stage and locked and submitted_at is not null;
  if v_done is not null then return v_done; end if;

  perform public.save_report(p_stage, p_fields, p_base);   -- checks CLOSED / CONFLICT

  update public.submissions
     set locked = true,
         submitted_at = now(),
         tags_snapshot = public.team_tags_json(v_team),
         updated_at = now()
   where team_id = v_team and stage = p_stage and submitted_at is null
  returning submitted_at into v_done;
  return v_done;
end $$;

-- Direct writes are no longer allowed; everything goes through the functions above.
revoke insert, update, delete on public.evidence_tags    from anon, authenticated;
revoke insert, update, delete on public.timeline_entries from anon, authenticated;
revoke insert, update, delete on public.submissions      from anon, authenticated;
revoke insert, update, delete on public.work_versions    from anon, authenticated;

revoke all on function public.save_tag(uuid, public.evidence_tag, text) from public, anon;
revoke all on function public.save_timeline(public.submission_stage, jsonb, int) from public, anon;
revoke all on function public.save_report(public.submission_stage, jsonb, int) from public, anon;
revoke all on function public.submit_report(public.submission_stage, jsonb, int) from public, anon;
revoke all on function public._claim_version(uuid, text, int) from public, anon, authenticated;
grant execute on function public.save_tag(uuid, public.evidence_tag, text) to authenticated;
grant execute on function public.save_timeline(public.submission_stage, jsonb, int) to authenticated;
grant execute on function public.save_report(public.submission_stage, jsonb, int) to authenticated;
grant execute on function public.submit_report(public.submission_stage, jsonb, int) to authenticated;

-- Lock every team's submission for a stage (replaces the 0002 version):
-- first wait for in-flight team saves (exclusive per-team locks), then lock.
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
         tags_snapshot = coalesce(s.tags_snapshot, public.team_tags_json(s.team_id)),
         updated_at = now()
   where s.stage = p_stage and not s.locked;
  get diagnostics n = row_count;

  update public.submissions s
     set tags_snapshot = public.team_tags_json(s.team_id)
   where s.stage = p_stage and s.tags_snapshot is null;
  return n;
end $$;
revoke all on function public.admin_lock_stage(public.submission_stage) from public, anon, authenticated;

-- ---------- 5. judge score policies -------------------------------------
create or replace function public.judge_may_score(p_team uuid, p_criterion text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.judge_assignments a where a.judge_id = auth.uid() and a.team_id = p_team)
     and (p_criterion <> 'presentation' or exists (select 1 from public.shortlist s where s.team_id = p_team))
$$;

drop policy if exists js_write on public.judge_scores;
drop policy if exists js_update on public.judge_scores;
create policy js_write on public.judge_scores for insert to authenticated
  with check (judge_id = auth.uid() and public.judge_may_score(team_id, criterion));
create policy js_update on public.judge_scores for update to authenticated
  using (judge_id = auth.uid())
  with check (judge_id = auth.uid() and public.judge_may_score(team_id, criterion));

-- ---------- 6. live status for the control room ------------------------
create or replace function public.admin_team_status()
returns table (
  team_id uuid, team_code text, name text, case_code text, checked_in boolean, is_dummy boolean,
  extra_minutes int, has_login boolean, tags int, tl_initial int, tl_final int,
  initial_state text, final_state text, last_activity timestamptz
) language sql stable security definer set search_path = public as $$
  select t.id, t.team_code, t.name, c.code, t.checked_in, t.is_dummy, t.extra_minutes,
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

-- ---------- 7. login throttling (server-side only) ----------------------
create table if not exists public.login_attempts (
  key          text primary key,          -- 'team:AIF-014' or 'staff:email'
  failures     int not null default 0,
  window_start timestamptz not null default now(),
  locked_until timestamptz
);
alter table public.login_attempts enable row level security;   -- no policies: service role only
revoke all on public.login_attempts from anon, authenticated;

-- Atomic "one more failed login" (safe when several attempts arrive at once).
create or replace function public.record_login_failure(p_key text, p_max int, p_window_s int, p_lock_s int)
returns void language sql security definer set search_path = public as $$
  insert into public.login_attempts as a (key, failures, window_start, locked_until)
  values (p_key, 1, now(), null)
  on conflict (key) do update set
    failures     = case when a.window_start < now() - make_interval(secs => p_window_s) then 1 else a.failures + 1 end,
    window_start = case when a.window_start < now() - make_interval(secs => p_window_s) then now() else a.window_start end,
    locked_until = case when (case when a.window_start < now() - make_interval(secs => p_window_s) then 1 else a.failures + 1 end) >= p_max
                        then now() + make_interval(secs => p_lock_s) else a.locked_until end
$$;
revoke all on function public.record_login_failure(text, int, int, int) from public, anon, authenticated;

-- ---------- 8. reset also clears versions + throttles ------------------
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
  update public.teams set extra_minutes = 0;
  update public.event
     set phase = 'waiting', phase_ends_at = null, twist_released_at = null, updated_at = now()
   where id = 1;
end $$;
revoke all on function public.admin_reset_event() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.admin_team_status() to service_role;
    grant execute on function public.admin_lock_stage(public.submission_stage) to service_role;
    grant execute on function public.admin_reset_event() to service_role;
    grant all on public.login_attempts to service_role;
    grant execute on function public.record_login_failure(text, int, int, int) to service_role;
    grant all on public.work_versions to service_role;
  end if;
end $$;

-- ---------- indexes for the live queries --------------------------------
create index if not exists evidence_tags_team_idx on public.evidence_tags (team_id);
create index if not exists judge_scores_team_idx on public.judge_scores (team_id);
create index if not exists judge_assignments_team_idx on public.judge_assignments (team_id);
create index if not exists teams_case_idx on public.teams (case_id);
