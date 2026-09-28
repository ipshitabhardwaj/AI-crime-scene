# Pre-Production Decision & Verification Checklist — The AI Files

Written 28 Sep 2026 from the audited code in this folder. **No gameplay or code was changed for this document.**

**Legend used on every item**

| Tag | Meaning |
| --- | --- |
| **[LOCAL ✓]** | Verified in code and/or by tests on the local Supabase stack (Postgres 16 + GoTrue + PostgREST). |
| **[CODE]** | Read from the code, not exercised by a test. Trustworthy, but not "tested". |
| **[PROD]** | Must be verified on the real Supabase project / Vercel. Nothing has been run there yet (network blocked from my side). |
| **[DECIDE]** | Needs a product/gameplay decision from your team. The current behaviour is described; it is **not** a recommendation. |
| **[DRY RUN]** | Can only be proven with real people, devices and venue Wi-Fi. |

---

## 0. Found while preparing this checklist (new — not in the audit report)

| # | Finding | Status |
|---|---|---|
| N1 | **Logging out on one device logs out the whole team.** `app/actions/auth.ts → logout()` calls `supabase.auth.signOut()`, whose default scope in supabase-js is `global` (checked in `node_modules/@supabase/auth-js`). That revokes every session of the team's shared account. Other devices keep working until their access token expires (JWT expiry, default 1 h), then get sent to the login page. One-line fix: `signOut({ scope: "local" })`. | [CODE] Not fixed, not tested — waiting for your go-ahead. Until then: tell teams **not to press Log out**. |
| N2 | **Correction to my audit report.** I wrote that one correct timeline event scored "11.3 → 3.8 of 15". Those numbers come from the 3-event key in the unit tests. On the real cases a lone correct event scored **9.4–9.6 (old) → 1.9–2.1 (new)**. See §1.1. | [LOCAL ✓] recomputed with the real scoring functions |
| N3 | **README says all three migrations are safe to re-run. That is false for `0001_init.sql`.** Re-running it stops at the first line with `ERROR: type "app_role" already exists` (harmless, nothing changes). 0002 and 0003 re-run cleanly. | [LOCAL ✓] tested inside a rolled-back transaction. Docs fix pending. |
| N4 | **Submitting the initial conclusion early also freezes tagging** until the twist. Tags use `can_write('initial') or can_write('final')`, and a submitted initial report makes `can_write('initial')` false. | [CODE] → [DECIDE] Q-G7 |
| N5 | **Per-team extra minutes carry over to every later phase.** `can_write` adds `teams.extra_minutes` to *every* deadline, so a team given +5 in Investigation also gets +5 in Twist and Final. | [CODE] → [DECIDE] Q-E4 |
| N6 | If the Supabase project's **API "Max rows" setting is below 1000**, the paging helper (`lib/db.ts`) stops after the first short page, and the silent truncation comes back. | [CODE] → check in §14 step 2 |
| N7 | **Scoring baselines are high** (see §1.2): tagging everything "Relevant" earns 9.2–10 of 15. A team that does that, places 2 correct events and copies the answer the twist reveals earns **~41/50 auto points**. The initial answer is never scored. | [LOCAL ✓] computed → [DECIDE] |
| N8 | **Judges can see all teams' work and the answer keys at any phase.** They can also score assigned teams in any phase: the policies check the assignment, not the phase. | [CODE] → [DECIDE] Q-J5 |
| N9 | The seed gives both judge accounts **the same password** (`SEED_JUDGE_PASSWORD`). Team PINs are stored in plain text in `team_credentials` (admin-only, needed to print slips). | [CODE] → [DECIDE] Q-O3 |

---

## GAMEPLAY / SCORING

### 1. Timeline scoring change  [DECIDE — not changed further]

**Formula (unchanged part):** `timeline = 15 × (0.5 × F1 + 0.5 × ORDER)`

- **Key events**: evidence items with a `timeline_pos` in the case JSON (A: 7, B/C/D: 6).
- **F1**: overlap between the team's evidence-linked timeline steps and the key events. Steps without evidence are ignored, and a duplicated item counts once. Precision = key events placed ÷ steps placed; recall = key events placed ÷ all key events.
- **ORDER**: the share of correctly ordered *pairs* among the key events the team placed.

**The only thing that changed** is ORDER when the team placed fewer than 2 key events:

| Key events placed | Old ORDER | New ORDER |
|---|---|---|
| 0 | 0 | 0 |
| **1** | **1 (full credit)** | **0** |
| ≥ 2 | pairs in right order ÷ all pairs | same |

**Real cases** (computed with `lib/scoring/index.ts`):

| Team timeline | A old | A new | B/C/D old | B/C/D new |
|---|---|---|---|---|
| 1 correct event only | 9.4 | **1.9** | 9.6 | **2.1** |
| 1 correct + 3 wrong events | 8.9 | 1.4 | 9.0 | 1.5 |
| 2 events, right order | 10.8 | 10.8 | 11.3 | 11.3 |
| 2 events, wrong order | 3.3 | 3.3 | 3.8 | 3.8 |
| First half of key, right order | 13.0 | 13.0 | 12.5 | 12.5 |
| All key events, reversed | 7.5 | 7.5 | 7.5 | 7.5 |
| All key events + 2 extra | 14.1 | 14.1 | 13.9 | 13.9 |
| Perfect | 15 | 15 | 15 | 15 |

Notice that even under the new rule, **2 correct events in the right order earn 11.3 of 15**. The formula rewards short, precise timelines over long ones. Whether that is intended is part of the decision.

**Files and rules affected by this decision:**

- `lib/scoring/index.ts` → `scoreTimeline()` (the `if (hits.length < 2) order = 0;` line)
- `scripts/test-scoring.ts` → the assertion `scoreTimeline(key, ["a"]) === 3.8` (it would be 11.3 under the old rule)
- `README.md` §6 scoring table (describes the new rule)
- **Not affected:** the database, the case files, and `scripts/validate-cases.ts`. Its "perfect team scores 50" check passes under both rules.
- After any change: rerun `npm run test`, then **Run auto-scoring** again. Scores are stored, so they don't update by themselves.

### 2. Complete scoring breakdown (per team, any case)  [LOCAL ✓ formulas] [DECIDE vs your official rules]

**The platform scores out of 100, not 50: 50 automatic + 50 from judges.** If your official rules say 50 total, that is a mismatch to resolve.

| Area | Criterion | Max | Who | Exactly how |
|---|---|---|---|---|
| Evidence / tagging | Evidence analysis | 15 | Auto | 15 × (items tagged exactly as the key ÷ all items, **including twist items**). Untagged counts as wrong. Uses the tag snapshot frozen at final submit or lock. |
| Timeline | Timeline | 15 | Auto | See §1. Uses the final (post-twist) timeline; if that is empty, the initial one. |
| Root cause | Root cause category | 10 | Auto | 10 if the final dropdown choice equals the answer key's post-twist category, else 0. If the final dropdown is empty, the initial choice is used. **Only the dropdown is scored automatically.** |
| Twist | Adaptability | 10 | Auto | 10 if the final category is right; 3 if it is wrong but different from the initial one; else 0. A team right from the start gets 10 too. |
| Report | Responsible party | 10 | Judge | 0–10 (steps of 0.5) → × 1 |
| Report | Logical reasoning | 15 | Judge | 0–10 → × 1.5 |
| Report | Evidence-based conclusion | 10 | Judge | 0–10 → × 1 |
| Presentation | Final report & presentation | 15 | Judge | 0–10 → × 1.5. **Only for shortlisted teams**; others get 0. |
| Penalties | — | 0 | — | **None.** No late penalty (saving simply stops at the deadline). Unsubmitted ("auto-locked") work is scored exactly like submitted work. No penalty for a wrong initial answer, and no bonus for correctness before the twist. |
| Bonuses | — | 0 | — | **None**, except that an earlier final submission wins ties (§5). |

What this means in practice:

- The report's free text (what happened, root-cause explanation, responsible party, key evidence, fix) is scored **only by judges**, and only for teams assigned to judges (top N, default 20).
- Every other team's total is its auto score out of 50.

**Baseline check** (computed from `lib/scoring`):

| Strategy | A | B | C | D |
|---|---|---|---|---|
| Tag every item "Relevant" (tagging only) | 10.0 | 9.2 | 10.0 | 9.7 |
| All "Relevant" + 2 correct events + twist answer (auto total) | 40.8 | 40.5 | 41.3 | 41.0 |
| Same, but keep the trap answer | 20.8 | 20.5 | 21.3 | 21.0 |
| Perfect, right from the start | 50 | 50 | 50 | 50 |
| Perfect, but trap answer first, corrected after twist | 50 | 50 | 50 | 50 |

### 3. What a team can edit, and when  [LOCAL ✓ — security_checks.sql + E2E]

"Deadline" means the phase timer plus that team's extra minutes. After the deadline nothing can be edited, even if the phase has not been changed yet.

| Moment | Tags + notes | Initial timeline | Initial report | Final timeline | Final report |
|---|---|---|---|---|---|
| Waiting | ✗ (case sealed) | ✗ | ✗ | ✗ | ✗ |
| Investigation, before deadline, initial **not** submitted | ✓ | ✓ | ✓ | ✗ | ✗ |
| Investigation, after submitting initial | **✗ (N4)** | ✗ | ✗ | ✗ | ✗ |
| Investigation, after deadline | ✗ | ✗ | ✗ | ✗ | ✗ |
| **Initial locked** (the lock) | ✗ (read-only) | ✗ | ✗ | ✗ | ✗ |
| Twist / Final report, before deadline, final not submitted | ✓ (incl. twist items) | ✗ (visible for comparison) | ✗ | ✓ | ✓ |
| After final submission | ✗ | ✗ | ✗ | ✗ | ✗ |
| Closed / Presentations / Results | ✗ | ✗ | ✗ | ✗ | ✗ |

**Admin exceptions:**

- **Unlock** reopens one team's report. It only works while that stage's phase is running, clears the submission time, and the team must submit again.
- **+5 min** gives one team more time (N5 applies).

### 4. How the twist works  [LOCAL ✓]

The twist fires when the admin moves to **Twist** (or any later phase). `goToPhase` in `app/actions/admin.ts` then does three things, all idempotent.

**1. Locks every initial report** (`admin_lock_stage('initial')`):

- It first waits for saves already in flight.
- Never-submitted drafts become *auto-locked* (no submission time).
- Tags are snapshotted.

**2. Makes an editable copy for every team** (`admin_prepare_final()`):

- Copies the initial timeline into the final timeline and the initial report into the final report.
- Only happens if the team has no final version yet.

**3. Releases the twist** by setting `event.twist_released_at`. The database then shows teams their case's twist evidence (`is_twist` items, codes T01/T02) and the twist text (`case_twists`). Before this, those rows are invisible to teams by RLS, not just hidden in the UI.

**What becomes editable:** tags (including the new items), the final timeline, and the final report, until the deadline or the team's final submission. The initial versions stay visible, read-only.

**Twist → Final report** changes only the timer and the message on screen. Permissions are identical in both phases.

**Going BACK** to before the twist hides the twist again. The final drafts and any tags on twist items stay, and the locked initial reports stay locked.

### 5. Tie-break  [CODE] (`lib/results.ts → getLeaderboard`)

1. Higher total (rounded to 0.1).
2. Earlier **final** submission time. Teams whose final was auto-locked (never submitted) come after all submitters.
3. Team code alphabetical (AIF-003 before AIF-014). This is an arbitrary last resort.

The same ordering picks the top N for judge assignment and the shortlist.

### 6. How auto and judge scores combine  [LOCAL ✓] (`lib/scoring → judgePoints`, `lib/results.ts`)

```
final total = auto total (0–50) + judge total (0–50)

judge total = Σ over the 4 criteria of  (average 0–10 score of the judges who scored that criterion ÷ 10) × criterion points
```

- Averages only include judges who **entered** that criterion. A judge who hasn't scored yet is not counted as 0.
- If no judge scored a criterion, it gives 0.
- Teams not assigned to any judge (outside the top N) have judge total 0.
- Presentation (15) exists only for shortlisted teams.
- Auto scores are stored when an admin clicks **Run auto-scoring**. The leaderboard adds the current judge scores live.
- **Order matters:** the shortlist is taken from the totals at the moment you click it. If judging of the top 20 is incomplete, partially judged teams get an advantage. [DECIDE] Q-J3

---

## TEAM / LOGIN MODEL

### 7. One shared login per team  [LOCAL ✓]

**Code path:**

1. `app/actions/auth.ts → loginTeam()` normalises the code (`AIF-014`) and passes it to `teamCodeToEmail()` in `lib/constants.ts`, giving `aif-014@<NEXT_PUBLIC_TEAM_EMAIL_DOMAIN>`.
2. It then calls `supabase.auth.signInWithPassword({ email, password: PIN })`.
3. That account is created once per team by `app/actions/admin-teams.ts → importTeams()`, via `auth.admin.createUser({ app_metadata: { role: "team", team_id } })`, plus a `profiles` row.
4. The database identifies the team through `my_team_id()` (migration 0001), which maps `auth.uid()` to the team.
5. There is **no per-member account** and no member identity anywhere.

**Implications:**

- Any number of devices can log in; nothing limits it. Each device has its own session.
  - Load-tested: 70 teams × 4 devices.
  - [PROD] Check that Supabase *single session per user* is **off** (§15).
- Anyone with the code and PIN *is* the team. A leaked slip means another team can read and edit that team's work.
- No record of *which* member did what; only "last activity" per team.
- The login throttle is per team code: 8 wrong PINs in 10 minutes by anyone locks the **whole team** out for 5 minutes. Reset PIN clears it.
- **Logout is global (N1).**
- More devices per team means more auth requests from one IP (§16).
- Reset PIN changes the PIN. Whether it also signs out existing devices is **not verified**. [DRY RUN]

### 8. Two devices editing the same work at once  [LOCAL ✓ unless marked]

| What | Behaviour |
|---|---|
| Timeline / report | Every save carries the version it started from. The first save wins. The second device gets **"A teammate changed this on another device"**, its edits are *not* saved, and autosave stops on that device until it clicks *load the latest version*. Nothing is overwritten. Load test: 280 simultaneous timeline saves gave exactly 1 winner per team and 210 clean conflicts. |
| Tag (same evidence item) | **Last write wins, with no warning** (tags have no version). The other device keeps showing its own choice until it refreshes. [CODE] |
| Submit on two devices at once | Idempotent: one submission, and both devices see the same submission time. Load test: 140 simultaneous submits for 70 teams. |
| Device A submits while device B is still typing | B's next save is refused ("closed"); B's unsaved text is not stored. [LOCAL ✓] |
| Offline device | Keeps edits in the page, shows "No connection…", retries every 4 s, and saves when back online. If a teammate saved meanwhile, it gets a conflict instead. |

---

## EVENT PHASES

### 9. State machine  [LOCAL ✓]

```
WAITING → INVESTIGATION → INITIAL LOCKED → TWIST → FINAL REPORT → CLOSED → PRESENTATIONS → RESULTS
          (timer 75 def.)                  (20)     (20)
```

Timers are set when entering a phase; 0 means no deadline. When a timer reaches 0, saving stops but **the phase does not advance by itself**. The admin must click the next step.

| Phase | Participants | Admins | Judges | Becomes locked on entry |
|---|---|---|---|---|
| Waiting | Log in, see "Case sealed" | Import/add/delete teams, upload/delete cases, rebalance, check-in, reset PIN, seed allowed | Log in; nothing assigned | — |
| Investigation | Read non-twist evidence; tag; initial timeline + report; submit initial | Timer, extend all, ±5 per team, unlock initial, upload case (with confirmation). **No** case deletion, rebalance or team-case change for teams with work | Can view any team's work + keys (N8); nothing assigned yet | — |
| Initial locked | Read-only | Next step | Same | All initial reports (drafts auto-locked), tags snapshotted |
| Twist | See twist evidence/text; tags; final timeline + report; submit final | Timer, extend, ±5, unlock final | Same | Twist released; final copies created |
| Final report | Same as Twist | Same | Same | — (new timer only) |
| Closed | Read-only | Auto-scoring, assign judges, shortlist, export | Score assigned teams (0–10 × 3 criteria) | All final reports, tags snapshotted |
| Presentations | Read-only; can see if shortlisted | Shortlist, export | Score presentation (shortlisted only) | — (projector shows order) |
| Results | Read-only; **teams never see their own score in the app** | Export | — | — (projector reveals top 10 with totals) |

### 10. Irreversible transitions and confirmations  [LOCAL ✓]

**Effectively irreversible:**

- **Leaving Investigation** locks all initial reports. Going BACK does not unlock them; only a per-team *unlock* does, and only while Investigation is running.
- **Entering Twist** releases the twist. BACK hides it again, but teams have already seen it.
- **Entering Closed** locks all final reports. Same per-team-unlock rule.
- **Results**: the reveal is public.
- **Reset event** deletes all work and scores.
- **Delete team / Delete ALL teams / Delete case.**
- **Reset PIN**: the old PIN stops working.
- **Create shortlist (replace)** can change who presents.
- **Assign judges** replaces non-shortlist assignments. Scores already given are kept.

**Needs a confirmation:**

- "I'm sure" checkbox:
  - Initial locked, Twist, Closed and Results.
  - Skipping any step.
  - Starting Investigation while a team has no case.
  - Auto-scoring before Closed.
  - Replacing a shortlist.
  - Uploading a case during the event.
- Typing **BACK**: any backwards move.
- Typing **RESET**: reset event.
- Typing **DELETE**: delete team, delete dummy teams, delete case (Waiting only).
- Typing **DELETE ALL TEAMS**: Waiting only.
- Results is refused until auto-scores exist.

**No confirmation:**

- Start Investigation (when every team has a case).
- Twist → Final, Closed → Presentations.
- Change timer, extend deadline (±120 min), ±5 per team.
- Unlock submission, check-in, reset PIN, assign judges, run auto-scoring after Closed.

---

## CASES

### 11. Summary

| Case | Initial hypothesis (trap) | Actual root cause | Evidence | Misleading / irrelevant | Twist | Main solving path | Difficulty concern |
|---|---|---|---|---|---|---|---|
| A · The 2:17 AM Incident | Compromised credentials / external attacker | Human error during an approved change | 18 (16 + 2 twist) | 4 / 2 (33%) | T01 change request CHG-4471, T02 on-call chat | E03 laptop is IT-issued → E04 grant cites CHG → E05 cron at 02:17 → E08 script defaults to SUSPENDED → E14 no template set → E10 quota → E11 disk full | Richest case; 7-step timeline; category overlap (§13) |
| B · The AI That Lied | AI model or prompt error | Bad or wrongly formatted input data | 18 (17 + 1 twist) | 4 / 3 (39%) | T01 POS vendor 5.2 notice | E04 rollback changed nothing → E09 request already has tiny totals → E08 comma decimals → E06 parser strips commas → E07 muted alert | Timeline step 1 is the twist item, so a perfect initial timeline is impossible (the final is what's scored) |
| C · The Vanishing Data | Deliberate insider action | Buggy code release | 18 (16 + 2 twist) | 4 / 2 (33%) | T01 PR #812 diff, T02 Neha's full session | E02/E09 deletion by svc_archiver with 0 days → E07 new variable name, default 0 → E08 prod sets old name → E16 Neha can't delete → E12 data is in S3 | Same session appears as misleading (E03 excerpt) and relevant (T02 full) |
| D · The Fake Signal | Hardware failure | Test or staging activity hitting production | 17 (15 + 2 twist) | 4 / 2 (35%) | T01 CI pipeline log, T02 #qa-team | E03 message has a 14 Aug timestamp + out-of-order sequence → E10 matches drill → E05 published by nx-sim-02 → E12 that's a CI runner → E11 replay tool defaults to prod | Timeline step 1 is the twist item; many non-timed "relevant" items |

### 12. Can the answer be guessed without real analysis?  [DECIDE — flagged, not rewritten]

- **The twist nearly states the answer in all four cases.** After the twist, the root-cause category is close to free for anyone who reads the new items: A shows the change request, B the vendor's format notice, C the PR renaming the variable, D the CI log.
  - That is 20 auto points (root cause 10 + adaptability 10).
  - Auto points then separate teams mainly on tagging and timeline.
- **Same pattern in every case:**
  - The briefing pushes an obvious hypothesis that is always wrong.
  - An "AI assistant summary" is misleading (A E13, C E13, D E07).
  - Teams that compare notes between cases, or play genre-savvy, can guess "not the obvious one".
- **Briefing hints:**
  - B lists "the model, the prompt, the data, the API or a person" and says the team blames the model.
  - C says "people are already pointing fingers".
  - D asks whether the sensor is "really" to blame and whether it "could happen again tomorrow night" (a nightly job).
- **Tagging baseline:** "all Relevant" earns 9.2–10 of 15 without reading anything (§2).
- **Answer sharing between teams:** each case is shared by ~17 teams in the same room. A team can copy a neighbour's dropdown choice. This is a physical-proctoring decision, not a software one.

### 13. Possible ambiguity or unfairness  [DECIDE — flagged, not rewritten]

**Category overlap.** The dropdown has 10 shared options; these are the defensible alternatives:

| Case | Keyed answer | Defensible alternatives |
|---|---|---|
| A | Human error during an approved change | *Buggy code release* (reengage.py silently defaults to the SUSPENDED template and retries forever) |
| B | Bad or wrongly formatted input data | *Third-party service* (the vendor changed the format); *Buggy code release* (the parser strips commas, though there was no release) |
| C | Buggy code release | *Human error during an approved change* (production config not updated at deploy) |
| D | Test or staging activity hitting production | *Human error* (secret missing after the CI migration); *Buggy code* (replay tool defaults to production). This is the clearest of the four. |

Auto-scoring gives 0 for any alternative.

**Timeline key leaves out timestamped causal events.** Including them lowers precision (e.g. 15 → 14.1):

- A: T01 (change request, 14 Oct 22:10) and T02 (on-call message, 00:07).
- B: E12 (store manager, 08:05) and E04 (09:30).
- C: T02 (Neha's session).
- D: E10 (drill, 14 Aug) and T02.

Is the key "the incident chain" or "everything that happened"? Teams are not told.

**A's timeline key includes E01** (the VPN login). A team that correctly realises the login was innocent may leave it out and lose points.

**Exonerating evidence is keyed "Relevant"** (A E03, B E04/E11, C E16/T02, D E04/E09), while the matching red herrings are "Misleading". This follows the tag help text, but teams must read that text.

**C: E03 and T02 are two views of the same session**, keyed misleading and relevant respectively.

**"Responsible party"** has no rubric beyond the answer-key sentence. Judges may disagree on what counts:

- A: engineer vs process vs script.
- C: the PR author vs the release process.

**B's title "The AI That Lied"** is deliberate misdirection. Some teams may call it unfair.

---

## REAL PRODUCTION VERIFICATION

### 14. Step-by-step: applying this to the real Supabase project  [PROD]

1. **Check first, change nothing yet** (§15).
2. **Data API → Settings:**
   - *Max rows* is **≥ 1000** (default 1000); see N6.
   - Exposed schemas include `public`.
3. **See which migrations are already applied.** SQL Editor → New query → paste and run:

   ```sql
   select
     to_regclass('public.event') is not null                                                   as m0001_applied,
     to_regprocedure('public.admin_prepare_final()') is not null                               as m0002_applied,
     to_regclass('public.work_versions') is not null                                           as has_work_versions,
     to_regclass('public.login_attempts') is not null                                          as has_login_attempts,
     to_regprocedure('public.submit_report(public.submission_stage, jsonb, integer)') is not null as has_submit_report,
     to_regprocedure('public.judge_may_score(uuid, text)') is not null                         as has_judge_rule,
     position('advisory' in pg_get_functiondef('public.admin_lock_stage(public.submission_stage)'::regprocedure)) > 0 as new_lock_function,
     has_table_privilege('authenticated', 'public.submissions', 'INSERT')                      as teams_can_insert_directly;
   ```

   - Run this again after migrating.
   - **Expected after 0003:** `t t t t t t t f`. The last column must be **false**.
   - Before 0003, `m0001_applied` and `m0002_applied` are true and the 0003 columns are false.
   - Note: `new_lock_function` errors if 0002 has never been applied.
   - [LOCAL ✓] This exact query returned the expected row on the local stack.
4. **Apply the migrations in order, only the missing ones:**
   - `0001_init.sql` only if `m0001_applied` is false. **Never re-run 0001** (N3).
   - `0002_event_operations.sql` if `m0002_applied` is false. Safe to re-run.
   - `0003_hardening.sql`. Safe to re-run.
   - Paste each whole file into a new query and run it. Stop if any statement errors.
5. **Security test:** run `supabase/tests/security_checks.sql`.
   - It must print **ALL SECURITY CHECKS PASSED**.
   - It runs in a transaction that rolls back.
   - Run it while the event is in Waiting, not during the event.
6. **Rerun the query from step 3** to confirm the database really is on 0003.
7. **Authentication settings.** Check each first (§15), then set:
   - Email provider on.
   - Password minimum length ≤ 6 and no required character classes, so a 6-digit PIN is accepted.
   - Leaked-password protection **off** if present (a 6-digit PIN would likely be rejected).
   - *Allow new users to sign up* **off**. Imports use the admin API, which should still work. [DRY RUN] confirm with a test import.
   - Single-session-per-user / session time-box / inactivity timeout **off**.
8. **Rate limits:** size them using §16, not blindly.
9. **Cases:**
   - Admin → Cases → delete **CASE-SAMPLE** if present.
   - Upload the 4 JSONs from `cases/`. The same code updates in place.
   - Preview each one.
10. **Staff accounts:** decide Q-O2/Q-O3, then run `npm run seed` locally (refuses unless in Waiting) or create the users by hand.
11. **What NOT to expose:**
    - The secret/service-role key: never in chat, git, screenshots or `NEXT_PUBLIC_*`.
    - `.env.local`.
    - `cases/SOLUTIONS.md`, the `cases/` folder and the repository (keep it private).
    - The admin and judge passwords.
    - The *Download new logins* CSV and the printed slips.

### 15. Check in the current Supabase dashboard *before* changing anything  [PROD]

I researched these settings earlier but have not seen your dashboard. Menus and plan features change, so note what each one actually shows:

| Where | What to check |
|---|---|
| Project home / billing | Plan (Free/Pro). Whether a Free project will **pause after inactivity** before event day (open it the day before). Region (Mumbai). |
| Authentication → **Rate Limits** | Which limits exist; the exact name of the sign-in/token-refresh limit; its **unit** (per 5 min? per hour?); whether it is **per IP**; its current value; whether your plan lets you edit it. |
| Authentication → Sessions | Whether single-session / time-box / inactivity settings exist on your plan and are off. |
| Authentication → Providers → Email / Password settings | Minimum length, required characters, leaked-password protection, "Confirm email", sign-ups allowed. |
| Project Settings → **JWT Keys** | Whether the project signs with the **legacy shared secret** or **asymmetric keys**. With the legacy secret, `getClaims()` calls the Auth server on every page load (more auth traffic); with asymmetric keys it verifies locally. Changing this is a project-wide change, so decide, don't just flip it. Also note the **access-token expiry** (default 3600 s); it drives §16. |
| Data API settings | Max rows ≥ 1000 (N6). |
| Database → Backups | What your plan offers. Free has no point-in-time restore; your backup is the Export CSV. |
| Reports / Usage | Baseline numbers, to compare with the dry run. |

### 16. Is raising the login limit to 1500 per 5 min really necessary?  [DECIDE with numbers]

The 1500 figure was a generous default, **not a requirement**. Size it from your own pattern.

**Assumptions (change them to yours):**

- Supabase counts sign-ins **and** token refreshes against one limit per client IP. My earlier research found the default to be **150 per 5 minutes**; re-check it on your dashboard.
- All sign-ins go through Vercel's servers. The server proxy refreshes from Vercel, and the browser client refreshes from the **college's single public IP**. Worst case: all of it counts as one IP.
- Wrong-PIN attempts count too; allow +15%.
- Tokens expire after `E` seconds (default 3600). Each active device refreshes about once per `E`. Because everyone logs in at about the same time, **the refreshes also arrive as a wave about 1 hour later**, and again each hour (3 waves in a 3-hour event).

**Formula:** needed limit ≥ 2 × (sign-ins in the busiest 5 minutes × 1.15). The ×2 is a safety margin.

| Devices per team (70 teams) | Devices D | All log in within 5 min | Staggered over 30 min at check-in (peak ≈ D/3) |
|---|---|---|---|
| 1 | 70 | 2 × 81 = **161** (default 150 is borderline) | 2 × 27 = **54** (default is fine) |
| 2 | 140 | **322** | **108** (default is fine) |
| 3 | 210 | **483** | **161** (borderline) |
| 4 | 280 | **644** | **215** |

**Conclusion:**

- With 1–2 devices per team and staggered logins, the default may be enough.
- With 3–4 devices, or "everyone log in now", raise it to roughly **500–700**. 1500 is more than needed but harmless if your plan allows it.
- The refresh wave is the same size as the login burst, so the same number covers it.
- Two alternatives to raising the limit (both decisions):
  - Limit devices per team.
  - Increase the access-token expiry to cover the whole event (fewer refreshes; a slightly longer life for a stolen token).
- [DRY RUN] Verify with Phase 3: keep devices logged in for **more than 65 minutes** and watch Authentication → Logs for `429` / "rate limit".

---

## VERCEL

### 17. Deployment checklist  [PROD]

1. Private GitHub repo. Check that `git ls-files` lists `.env.example` but **not** `.env.local`.
2. Vercel → New Project → import it. Framework Next.js (auto). Default build/install commands.
3. Environment variables (§18), scoped to **Production**.
   - Decide about **Preview** deployments. Every pushed branch would otherwise get a URL that talks to the **same production database**.
   - Either leave the variables off Preview or disable preview deployments.
4. Mark `SUPABASE_SERVICE_ROLE_KEY` as **Sensitive**.
5. Settings → Functions → **Region: Mumbai (bom1)**. Check that your plan allows choosing it.
6. Deploy. Then set `NEXT_PUBLIC_SITE_URL` to the final URL and **redeploy**: `NEXT_PUBLIC_*` values are baked in at build time.
7. Settings → **Deployment Protection**: the production URL must be reachable without a Vercel login.
8. Supabase → Authentication → URL Configuration → Site URL = the production URL (no emails are sent, but keep it correct).
9. Smoke test:
   - `/` and `/screen` load.
   - Admin login works; Dashboard has no warnings.
   - A dummy team logs in and sees "Case sealed".
10. Run the leak check (§19).
11. Plan limits to check: Hobby is for non-commercial use, and there are function time limits. The CSV import creates up to 20 logins per request. [DRY RUN] Import 70 rows once on the real deployment.
12. **Freeze deploys on event day.** Don't push to the production branch.

### 18. Environment variables

| Variable | Class | Where | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Vercel + local | In the browser bundle by design |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Vercel + local | The publishable key; safe only because RLS is on |
| `NEXT_PUBLIC_TEAM_EMAIL_DOMAIN` | Public | Vercel + local | Must be identical everywhere, or team logins break |
| `NEXT_PUBLIC_SITE_URL` | Public | Vercel + local | Printed on slips |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server-only, SENSITIVE** | Vercel (Sensitive) + local `.env.local` | Bypasses all security rules. Never `NEXT_PUBLIC_` |
| `SEED_ADMIN_EMAIL` | Local only | `.env.local` | Not needed on Vercel |
| `SEED_ADMIN_PASSWORD`, `SEED_JUDGE_PASSWORD` | Local only, **SENSITIVE** | `.env.local` | Not needed on Vercel |

### 19. Proving the secret key is not in the browser  [PROD]

[LOCAL ✓] The local production build's client bundles did not contain the key. Repeat on the real deployment:

**A. Automated (PowerShell, on your laptop).**

- It downloads every JavaScript file the public pages load and searches them.
- You type only the **first 12 characters** of your secret key. That text stays on your machine; never paste it into chat.

```powershell
$site   = "https://YOUR-APP.vercel.app"
$needle = Read-Host "First 12 characters of the SECRET key"
$files  = @()
foreach ($p in "/", "/play", "/admin", "/judge", "/screen") {
  $html  = (Invoke-WebRequest "$site$p" -UseBasicParsing).Content
  $files += [regex]::Matches($html, '/_next/static/[^"'' ]+?\.js') | ForEach-Object Value
}
$files = $files | Sort-Object -Unique
foreach ($f in $files) {
  $js = (Invoke-WebRequest "$site$f" -UseBasicParsing).Content
  foreach ($bad in $needle, "sb_secret_", "service_role", "SUPABASE_SERVICE_ROLE_KEY") {
    if ($js.Contains($bad)) { Write-Host "FOUND '$bad' in $f" -ForegroundColor Red }
  }
}
"Checked $($files.Count) files."
```

- **Pass:** only the "Checked N files" line, with N > 0.
- I have not run this script on Windows. I did check its file pattern against this build's HTML: it found 8 script files on the home page.
- Scripts that load later (lazy chunks) are not in the HTML, which is why part B is also needed.
- Because `/play`, `/admin` and `/judge` redirect to the login page, this covers the public bundles. Part B covers the logged-in ones.

**B. Manual, logged in.**

1. Log in as admin, then as a team.
2. Open DevTools → Network, tick *Disable cache* and reload each page.
3. Press **Ctrl+Shift+F** (search all sources), search for your key's first 12 characters and for `sb_secret_`. There should be no results.

**C. Configuration.** In Vercel, the key's variable name must not start with `NEXT_PUBLIC_`.

---

## DRY RUN

### 20. Three-phase dry run  [DRY RUN]

Use the **real deployment** and the **venue Wi-Fi**, with dummy teams. Use short timers (5–10 min per phase) unless stated. After each phase: **Reset event**, then check that the work is gone and teams and logins are kept.

**Phase 1: 5 devices, ~1 hour, organisers only.** Admin laptop, projector, 2 laptops for team T01, 1 phone for team T02.

- The full flow once: start → lock → twist → final → close → score → assign → shortlist → presentations → reveal → export → reset.
- Every failure simulation in the table below, one at a time.

**Phase 2: 20 devices, ~1.5 hours.** For example 6 teams × 3 devices, plus admin, projector and 2 judges on their own laptops.

- **CSV import** of a copy of your real Google Form export, with 6 rows plus deliberate problems: a duplicate, a blank row, a non-English name, a bad email.
- Print slips, check in at a desk, use real timers (compressed), and brief the teams as on event day.
- Both judges score the same team; check the average and *Save & next*.
- Re-create the shortlist, confirm the replace warning, then **Delete ALL teams**.

**Phase 3: 50+ devices, ideally a full class, ~1.5 hours.** For example 17 teams × 3 devices.

- **Login burst:** everyone logs in within 2 minutes. Afterwards, check Supabase → Authentication → Logs for 429s.
- **Stay logged in for more than 65 minutes** to observe the token-refresh wave (§16).
- **Propagation:** time from clicking *Release twist* until every screen shows it. The target is under 15 s.
- **Admin lock under load:** lock while everyone is typing.
- Watch Supabase Reports (API/DB) and Vercel logs for errors.

**Failure simulations**

| Simulation | How | Expected | Phase |
|---|---|---|---|
| Wi-Fi disconnect | Turn off Wi-Fi on a team laptop, keep typing for 1 minute, turn it back on | "No connection…", then "All changes saved"; the Control room shows recent activity | 1, 2 |
| Refresh | Press F5 right after "All changes saved"; then again while "Saving…" | First: content intact. Second: the browser asks before leaving | 1 |
| Duplicate submit | Double-click Submit; two devices click Submit together | One submission; both show the same "Submitted at" time | 1, 2 |
| Two devices, same work | Both edit the report; both change the same tag | Report: the second device gets the teammate warning and nothing is overwritten. Tag: last click wins (known) | 1, 2 |
| Wrong team URL | A team opens `/admin`, `/judge`, and another team's evidence link; types a wrong team code | Redirected to their own area / not found / "Wrong team code or PIN" | 1 |
| Wrong PIN × 8 | Enter a wrong PIN 8 times | "Too many wrong attempts"; Reset PIN clears it | 1 |
| Log out on one device (N1) | Team device A presses Log out; keep device B open for more than 1 hour | Confirms the global-logout issue: B is logged out at the next refresh | 1 |
| Expired phase | Let the timer reach 0 while typing; then give one team +5 | "Time up", saving refused; only that team can save again | 1, 2 |
| Twist release | Release the twist | All devices show the new items and the prefilled final within ~15 s | all |
| Admin lock during saves | Everyone typing, admin locks | After the lock, every team shows submitted or auto-locked; the last text visible in Judge view matches what the team saw as saved | 2, 3 |
| Judge scoring | Two judges score the same team; a judge opens an unassigned team | Average shown; the unassigned team is view-only | 2 |
| CSV import | See Phase 2; then import the same file again | Summary with 0 errors after fixes; the second import creates 0 | 2 |
| Reset | Reset (type RESET) twice | Work gone; teams, logins and cases kept; the second reset is harmless | all |
| Admin laptop dies | Close the admin browser mid-phase, log in on another device | The event continues; timers are held by the server | 2 |
| Projector refresh | Reload `/screen` | Recovers without a login | 1 |

### 21. One-page organiser checklist

See **`docs/organizer-checklist.pdf`** (A4, printable). The source is `docs/organizer-checklist.html`.

---

## QUESTIONS WE MUST ANSWER AS A TEAM

These cannot be settled from the code. The current behaviour is noted in brackets; that is **not** a recommendation.

**Timing**

- **Q-T1** How long is each phase: Investigation, Twist, Final report? [defaults: 75 / 20 / 20]
- **Q-T2** Is there a gap between the lock and the twist, and how long? Who announces it?
- **Q-T3** Are Twist and Final report really two phases, or one? [identical permissions; two timers]

**Gameplay**

- **Q-G1** Is the official total out of 50 or 100? What is the official breakdown? [50 auto + 50 judge]
- **Q-G2** Timeline rule: does one correct event earn ordering credit? Should 2 correct events score 11.3/15? Should correct-but-extra events cost points? [new rule; precision penalty]
- **Q-G3** Should a correct *initial* answer (before the twist) earn anything? [not scored at all]
- **Q-G4** Is the tagging baseline acceptable (≈10/15 for tagging everything Relevant)? Should wrong tags cost more than untagged ones? [both score 0]
- **Q-G5** Is the twist meant to reveal the answer, or only to hint at it? (§12)
- **Q-G6** Late or unsubmitted work: score it as-is, or apply a penalty? [scored as-is]
- **Q-G7** Should submitting the initial conclusion early freeze tagging until the twist? [yes (N4)]
- **Q-G8** Is the timeline key "the incident chain only" or "every relevant timed event"? Will teams be told? (§13)
- **Q-G9** Do alternative root-cause categories (§13 table) get partial credit? [0]

**Team and login**

- **Q-L1** How many devices per team: 1, 2 or up to 4? [unlimited]
- **Q-L2** One shared team login, or individual logins per member? [shared]
- **Q-L3** What do we tell teams about logging out? Should the global-logout issue (N1) be fixed? [not fixed]

**Event operations**

- **Q-E1** Case assignment: round-robin by team number, or chosen? [round-robin]
- **Q-E2** Physical rules against sharing answers between teams on the same case (seating, walking around)?
- **Q-E3** What does the platform do if the internet fails — do we switch to paper? What is the cut-off?
- **Q-E4** Should extra minutes for one team apply only to the current phase? [all later phases too (N5)]
- **Q-E5** When is it acceptable to use *unlock* for a team?

**Judging**

- **Q-J1** Judge formula: keep the 4 criteria and weights (10 / 15 / 10 / 15)?
- **Q-J2** How many teams get judged (top N) and by how many judges each? [20, 2 each]
- **Q-J3** Is the shortlist created from auto scores only, or after judging is complete? [whatever the totals are when clicked]
- **Q-J4** Shortlist size, and presentation length and format? [10]
- **Q-J5** May judges see team work before Closed? May they see answer keys? [yes to both (N8)]
- **Q-J6** What counts as the correct "responsible party" for each case (rubric)?

**Results**

- **Q-R1** Is the tie-break acceptable (earlier final submission, then team code)?
- **Q-R2** Do teams see their own score or rank, or only the top 10 on the projector? [top 10 only]
- **Q-R3** Is anything published after the event (full ranking, answers)?

**Ownership and policy**

- **Q-O1** Who has admin authority on the day? Who alone may click Lock, Twist, Close and Reveal?
- **Q-O2** How many admin accounts are there, and who holds them? [1 from the seed]
- **Q-O3** Does each judge get their own account and password? [2 judges share a password]
- **Q-O4** Who owns Supabase and Vercel production access? Who is the backup person?
- **Q-O5** Reset policy: when may *Reset event* / *Delete ALL teams* be used? Who keeps the exported CSVs, and for how long?
- **Q-O6** Rate-limit plan: raise the limit, stagger logins, limit devices, or lengthen token expiry? (§16)
