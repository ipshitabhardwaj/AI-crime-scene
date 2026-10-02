-- 0005 — Reset fix (optional, safe to run more than once).
--
-- Hosted Supabase refuses DELETE / UPDATE statements without a WHERE clause
-- ("DELETE requires a WHERE clause"), also inside functions called through
-- the API. admin_reset_event() had such statements, so "Reset event" failed.
-- The app now falls back to doing the reset itself, so running this file is
-- not required; it only makes the reset a single database transaction again.

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
  delete from public.work_versions where true;
  delete from public.login_attempts where true;
  update public.teams set extra_minutes = 0, phase_extra_minutes = 0, phase_extra_phase = null where true;
  update public.event
     set phase = 'waiting', phase_ends_at = null, twist_released_at = null, updated_at = now()
   where id = 1;
end $$;
revoke all on function public.admin_reset_event() from public, anon, authenticated;
grant execute on function public.admin_reset_event() to service_role;
