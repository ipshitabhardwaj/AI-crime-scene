-- =====================================================================
-- The AI Files — step 2: event operations
-- Run AFTER 0001_init.sql: SQL Editor -> paste this file -> Run
--
-- These functions are called by the admin control room (server side,
-- with the service-role key). Teams and judges cannot call them.
-- All of them are safe to run more than once.
-- =====================================================================

-- Tags a team has set right now, as {"E01": "relevant", ...}
create or replace function public.team_tags_json(p_team uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(e.code, et.tag), '{}'::jsonb)
  from public.evidence_tags et
  join public.evidence e on e.id = et.evidence_id
  where et.team_id = p_team and et.tag is not null
$$;

-- Lock every team's submission for a stage. Teams that never submitted
-- get a row with whatever they saved, so nobody ends up with nothing.
-- Returns the number of submissions locked by this call.
create or replace function public.admin_lock_stage(p_stage public.submission_stage) returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  insert into public.submissions (team_id, stage)
  select t.id, p_stage
  from public.teams t
  where t.auth_user_id is not null
  on conflict (team_id, stage) do nothing;

  update public.submissions s
     set locked = true,            -- submitted_at stays null = "auto-locked, never submitted"
         tags_snapshot = coalesce(s.tags_snapshot, public.team_tags_json(s.team_id)),
         updated_at = now()
   where s.stage = p_stage and not s.locked;
  get diagnostics n = row_count;

  -- rows locked earlier by the team itself but without a snapshot
  update public.submissions s
     set tags_snapshot = public.team_tags_json(s.team_id)
   where s.stage = p_stage and s.tags_snapshot is null;

  return n;
end $$;

-- Twist release: give each team a 'final' copy of its initial timeline and
-- report to revise (only where no final copy exists yet).
create or replace function public.admin_prepare_final() returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.timeline_entries (team_id, stage, position, evidence_id, time_label, description)
  select i.team_id, 'final', i.position, i.evidence_id, i.time_label, i.description
  from public.timeline_entries i
  where i.stage = 'initial'
    and not exists (select 1 from public.timeline_entries f
                    where f.team_id = i.team_id and f.stage = 'final');

  insert into public.submissions (team_id, stage, what_happened, root_cause_category,
                                  root_cause_md, responsible, key_evidence, fix_md)
  select team_id, 'final', what_happened, root_cause_category,
         root_cause_md, responsible, key_evidence, fix_md
  from public.submissions
  where stage = 'initial'
  on conflict (team_id, stage) do nothing;
end $$;

-- Wipe all team work and scores and go back to 'waiting'.
-- For dry runs only. Teams, cases and accounts are kept.
create or replace function public.admin_reset_event() returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.shortlist where true;
  delete from public.judge_scores where true;
  delete from public.judge_assignments where true;
  delete from public.auto_scores where true;
  delete from public.submissions where true;
  delete from public.timeline_entries where true;
  delete from public.evidence_tags where true;
  update public.teams set extra_minutes = 0 where true;
  update public.event
     set phase = 'waiting', phase_ends_at = null, twist_released_at = null, updated_at = now()
   where id = 1;
end $$;

-- Only the service role (server code) may run these.
revoke all on function public.admin_lock_stage(public.submission_stage) from public, anon, authenticated;
revoke all on function public.admin_prepare_final()  from public, anon, authenticated;
revoke all on function public.admin_reset_event()    from public, anon, authenticated;
revoke all on function public.team_tags_json(uuid)   from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.admin_lock_stage(public.submission_stage) to service_role;
    grant execute on function public.admin_prepare_final() to service_role;
    grant execute on function public.admin_reset_event() to service_role;
    grant execute on function public.team_tags_json(uuid) to service_role;
  end if;
end $$;

-- Judges may also need to see the shortlist order during presentations,
-- and teams may see whether they were shortlisted after results.
drop policy if exists shortlist_team on public.shortlist;
create policy shortlist_team on public.shortlist for select to authenticated
  using (team_id = public.my_team_id()
         and (select phase from public.event where id = 1) in ('presentations', 'results'));
