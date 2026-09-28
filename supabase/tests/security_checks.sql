-- =====================================================================
-- The AI Files — database security checks
--
-- Run in Supabase SQL Editor (paste, Run) AFTER migrations 0001–0003.
-- Everything happens inside one transaction that is ROLLED BACK at the
-- end: it creates throw-away test users/teams/cases, plays through the
-- rules as a team, a second team, a judge and an anonymous visitor, and
-- changes nothing permanently. Run it before the event, not during.
--
-- Success: the last message is "ALL SECURITY CHECKS PASSED".
-- Failure: an error names the check that failed.
-- =====================================================================
begin;

-- ---------- fixtures ---------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000a001', 'zz-sec-team1@test.invalid'),
  ('00000000-0000-4000-8000-00000000a002', 'zz-sec-team2@test.invalid'),
  ('00000000-0000-4000-8000-00000000a003', 'zz-sec-judge@test.invalid');

insert into public.cases (id, code, title, root_cause_options) values
  ('00000000-0000-4000-8000-0000000c0001', 'ZZ-SEC-X', 'X', '{a,b}'),
  ('00000000-0000-4000-8000-0000000c0002', 'ZZ-SEC-Y', 'Y', '{a,b}');
insert into public.case_twists values ('00000000-0000-4000-8000-0000000c0001', 'secret twist');
insert into public.evidence (id, case_id, code, type, title, is_twist) values
  ('00000000-0000-4000-8000-0000000e0001', '00000000-0000-4000-8000-0000000c0001', 'E01', 'log', 'x-e01', false),
  ('00000000-0000-4000-8000-0000000e0002', '00000000-0000-4000-8000-0000000c0001', 'T01', 'log', 'x-t01', true),
  ('00000000-0000-4000-8000-0000000e0003', '00000000-0000-4000-8000-0000000c0002', 'E01', 'log', 'y-e01', false);
insert into public.answer_key values ('00000000-0000-4000-8000-0000000c0001', 'a', '', '', 'b', '');
insert into public.answer_evidence values ('00000000-0000-4000-8000-0000000e0001', 'relevant', 1);

insert into public.teams (id, team_code, name, case_id, auth_user_id) values
  ('00000000-0000-4000-8000-0000000d0001'::uuid, 'ZZSEC-1', 'Sec One', '00000000-0000-4000-8000-0000000c0001', '00000000-0000-4000-8000-00000000a001'),
  ('00000000-0000-4000-8000-0000000d0002'::uuid, 'ZZSEC-2', 'Sec Two', '00000000-0000-4000-8000-0000000c0002', '00000000-0000-4000-8000-00000000a002');
insert into public.team_credentials values ('00000000-0000-4000-8000-0000000d0001', '123456', now());
insert into public.profiles values
  ('00000000-0000-4000-8000-00000000a001', 'team', '00000000-0000-4000-8000-0000000d0001', 'Sec One'),
  ('00000000-0000-4000-8000-00000000a002', 'team', '00000000-0000-4000-8000-0000000d0002', 'Sec Two'),
  ('00000000-0000-4000-8000-00000000a003', 'judge', null, 'Sec Judge');
insert into public.judge_assignments values ('00000000-0000-4000-8000-00000000a003', '00000000-0000-4000-8000-0000000d0001');
insert into public.auto_scores (team_id) values ('00000000-0000-4000-8000-0000000d0001');

update public.event set phase = 'waiting', phase_ends_at = null, twist_released_at = null where id = 1;

-- helpers (temporary, disappear on rollback)
create function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p::text, true);
end $$;
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'SECURITY CHECK FAILED: %', what; end if; end $$;

-- ---------- phase: waiting --------------------------------------------
select pg_temp.as_user('00000000-0000-4000-8000-00000000a001');
set local role authenticated;
select pg_temp.check((select count(*) from public.evidence) = 0, 'waiting: team sees no evidence');
select pg_temp.check((select count(*) from public.cases) = 0, 'waiting: team sees no case');
do $$ begin
  perform public.save_tag('00000000-0000-4000-8000-0000000e0001', 'relevant', '');
  raise exception 'SECURITY CHECK FAILED: waiting: tagging must be closed';
exception when others then if sqlerrm not like 'CLOSED%' then raise; end if; end $$;
reset role;

-- ---------- phase: investigation --------------------------------------
update public.event set phase = 'investigation', phase_ends_at = now() + interval '1 hour' where id = 1;
select pg_temp.as_user('00000000-0000-4000-8000-00000000a001');
set local role authenticated;
select pg_temp.check((select count(*) from public.evidence) = 1, 'team sees only its own, non-twist evidence');
select pg_temp.check((select count(*) from public.case_twists) = 0, 'twist text hidden before release');
select pg_temp.check((select count(*) from public.answer_key) = 0, 'answer_key hidden from teams');
select pg_temp.check((select count(*) from public.answer_evidence) = 0, 'answer_evidence hidden from teams');
select pg_temp.check((select count(*) from public.team_credentials) = 0, 'PINs hidden from teams');
select pg_temp.check((select count(*) from public.auto_scores) = 0, 'scores hidden from teams');
select pg_temp.check((select count(*) from public.judge_scores) = 0, 'judge scores hidden from teams');
select pg_temp.check((select count(*) from public.teams) = 1, 'team sees only its own team row');
select pg_temp.check((select count(*) from public.profiles) = 1, 'team sees only its own profile');

select public.save_tag('00000000-0000-4000-8000-0000000e0001', 'relevant', 'ok');
do $$ begin
  perform public.save_tag('00000000-0000-4000-8000-0000000e0003', 'relevant', '');
  raise exception 'SECURITY CHECK FAILED: team tagged another case''s evidence';
exception when others then if sqlerrm not like 'INVALID_EVIDENCE%' then raise; end if; end $$;
do $$ begin
  perform public.save_tag('00000000-0000-4000-8000-0000000e0002', 'relevant', '');
  raise exception 'SECURITY CHECK FAILED: team tagged hidden twist evidence';
exception when others then if sqlerrm not like 'INVALID_EVIDENCE%' then raise; end if; end $$;
do $$ begin
  insert into public.evidence_tags (team_id, evidence_id, tag) values ('00000000-0000-4000-8000-0000000d0001', '00000000-0000-4000-8000-0000000e0001', 'misleading');
  raise exception 'SECURITY CHECK FAILED: direct table write allowed';
exception when insufficient_privilege then null; end $$;
do $$ begin
  update public.submissions set submitted_at = '2020-01-01' where true;
  raise exception 'SECURITY CHECK FAILED: team can edit submitted_at';
exception when insufficient_privilege then null; end $$;
update public.event set phase = 'results' where id = 1;   -- silently filtered by RLS
select pg_temp.check((select phase from public.event where id = 1) = 'investigation', 'team cannot change the phase');
do $$ begin
  perform public.admin_reset_event();
  raise exception 'SECURITY CHECK FAILED: team called admin_reset_event';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform public.admin_lock_stage('initial');
  raise exception 'SECURITY CHECK FAILED: team called admin_lock_stage';
exception when insufficient_privilege then null; end $$;

-- versioned timeline: stale base must conflict
select pg_temp.check(public.save_timeline('initial', '[{"evidence_id":"00000000-0000-4000-8000-0000000e0001","time_label":"1","description":"a"}]', 0) = 1, 'timeline v1');
do $$ begin
  perform public.save_timeline('initial', '[]', 0);
  raise exception 'SECURITY CHECK FAILED: stale timeline save overwrote a newer one';
exception when others then if sqlerrm not like 'CONFLICT%' then raise; end if; end $$;
select pg_temp.check(public.save_timeline('initial', '[{"evidence_id":null,"time_label":"1","description":"b"}]', 1) = 2, 'timeline v2');
do $$ begin
  perform public.save_timeline('initial', '[{"evidence_id":"00000000-0000-4000-8000-0000000e0003"}]', 2);
  raise exception 'SECURITY CHECK FAILED: timeline referenced another case''s evidence';
exception when others then if sqlerrm not like 'INVALID_EVIDENCE%' then raise; end if; end $$;

-- report + idempotent submit
select pg_temp.check(public.save_report('initial', '{"what_happened":"x","root_cause_category":"a","key_evidence":["E01"]}', 0) = 1, 'report v1');
create temp table sub1 as select public.submit_report('initial', '{"what_happened":"x","root_cause_category":"a"}', 1) as t;
select pg_temp.check((select t from sub1) is not null, 'submit returns time');
select pg_temp.check(public.submit_report('initial', '{}', 999) = (select t from sub1), 'second submit is idempotent (same time)');
select pg_temp.check((select locked and tags_snapshot->>'E01' = 'relevant' from public.submissions where stage = 'initial'), 'submit locks and snapshots tags');
do $$ begin
  perform public.save_report('initial', '{"what_happened":"changed"}', 2);
  raise exception 'SECURITY CHECK FAILED: report edited after submit';
exception when others then if sqlerrm not like 'CLOSED%' then raise; end if; end $$;
do $$ begin
  perform public.save_timeline('initial', '[]', 2);
  raise exception 'SECURITY CHECK FAILED: timeline edited after submit';
exception when others then if sqlerrm not like 'CLOSED%' then raise; end if; end $$;
do $$ begin
  perform public.save_tag('00000000-0000-4000-8000-0000000e0001', 'misleading', '');
  raise exception 'SECURITY CHECK FAILED: tags edited after submit';
exception when others then if sqlerrm not like 'CLOSED%' then raise; end if; end $$;
reset role;

-- ---------- deadlines (team 2) ----------------------------------------
update public.event set phase_ends_at = now() where id = 1;                -- exactly at the deadline
select pg_temp.as_user('00000000-0000-4000-8000-00000000a002');
set local role authenticated;
do $$ begin
  perform public.save_tag('00000000-0000-4000-8000-0000000e0003', 'relevant', '');
  raise exception 'SECURITY CHECK FAILED: write accepted at the deadline';
exception when others then if sqlerrm not like 'CLOSED%' then raise; end if; end $$;
reset role;
update public.teams set extra_minutes = 5 where team_code = 'ZZSEC-2';     -- extension
set local role authenticated;
select public.save_tag('00000000-0000-4000-8000-0000000e0003', 'relevant', 'extended');
select pg_temp.check((select count(*) from public.evidence_tags) = 1, 'team 2 sees only its own tags');
select pg_temp.check((select count(*) from public.submissions) = 0, 'team 2 cannot see team 1 submission');
reset role;

-- ---------- twist -------------------------------------------------------
update public.event set phase = 'twist', phase_ends_at = now() + interval '20 min', twist_released_at = now() where id = 1;
select pg_temp.as_user('00000000-0000-4000-8000-00000000a001');
set local role authenticated;
select pg_temp.check((select count(*) from public.evidence) = 2, 'twist evidence visible after release');
select pg_temp.check((select count(*) from public.case_twists) = 1, 'twist text visible after release');
select public.save_tag('00000000-0000-4000-8000-0000000e0002', 'relevant', '');
select pg_temp.check(public.save_report('final', '{"root_cause_category":"b"}', 0) = 1, 'final report editable in twist');
reset role;

-- ---------- judge -------------------------------------------------------
select pg_temp.as_user('00000000-0000-4000-8000-00000000a003');
set local role authenticated;
select pg_temp.check((select count(*) from public.submissions where team_id = '00000000-0000-4000-8000-0000000d0001') >= 1, 'judge reads submissions');
select pg_temp.check((select count(*) from public.team_credentials) = 0, 'judge cannot read PINs');
insert into public.judge_scores (judge_id, team_id, criterion, score) values ('00000000-0000-4000-8000-00000000a003', '00000000-0000-4000-8000-0000000d0001', 'reasoning', 7);
do $$ begin
  insert into public.judge_scores (judge_id, team_id, criterion, score) values ('00000000-0000-4000-8000-00000000a003', '00000000-0000-4000-8000-0000000d0002', 'reasoning', 9);
  raise exception 'SECURITY CHECK FAILED: judge scored an unassigned team';
exception when insufficient_privilege then null; end $$;
do $$ begin
  insert into public.judge_scores (judge_id, team_id, criterion, score) values ('00000000-0000-4000-8000-00000000a003', '00000000-0000-4000-8000-0000000d0001', 'presentation', 9);
  raise exception 'SECURITY CHECK FAILED: presentation score for a team not on the shortlist';
exception when insufficient_privilege then null; end $$;
do $$ begin
  update public.judge_scores set team_id = '00000000-0000-4000-8000-0000000d0002' where team_id = '00000000-0000-4000-8000-0000000d0001';
  raise exception 'SECURITY CHECK FAILED: judge moved a score to an unassigned team';
exception when insufficient_privilege then null; end $$;
do $$ begin
  update public.auto_scores set tagging = 15 where true;
  if exists (select 1 from public.auto_scores where tagging = 15) then
    raise exception 'SECURITY CHECK FAILED: judge changed auto scores';
  end if;
exception when insufficient_privilege then null; end $$;
reset role;

-- ---------- anonymous visitor (projector) -------------------------------
set local role anon;
select pg_temp.check((select count(*) from public.event) = 1, 'anon can read event');
select pg_temp.check((select count(*) from public.teams) = 0, 'anon cannot read teams');
select pg_temp.check((select count(*) from public.evidence) = 0, 'anon cannot read evidence');
reset role;

do $$ begin raise notice 'ALL SECURITY CHECKS PASSED (rolling back, nothing was changed)'; end $$;
rollback;
