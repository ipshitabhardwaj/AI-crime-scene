# Pre-Production Checklist — The AI Files (final behaviour)

Updated 29 Sep 2026, after the implementation round. This file describes the platform **as it is now**. The detailed rules live in:

- [`SCORING.md`](SCORING.md)
- [`STATE_MACHINE.md`](STATE_MACHINE.md)
- [`CASE_AUDIT.md`](CASE_AUDIT.md) (organisers only)

| Tag | Meaning |
| --- | --- |
| **[LOCAL ✓]** | Tested on the local stack (Postgres 16 + GoTrue v2.170 + PostgREST 12), not on hosted Supabase |
| **[PROD]** | Must be verified on the real Supabase project / Vercel. Nothing has been run there yet. |
| **[DRY RUN]** | Can only be proven with real people, devices and venue Wi-Fi |
| **ASSUMPTION** | A default I chose because no official rule was given — can be changed later |

---

## 1. What changed in this round

| Area | Final behaviour | Status |
|---|---|---|
| Logout | Logs out **only that device** (`signOut({ scope: "local" })`). Session refresh happens only on the server; the browser's polling client carries no session. | [LOCAL ✓] 3 devices; one logs out; the other two keep working **after token expiry**; the logged-out one logs in again |
| Auto-scoring | 15 evidence analysis + 15 timeline + 6 initial hypothesis + 8 root cause + 6 evidence support = 50. The shallow "everything Relevant + 2 events + copy the twist" strategy scores ~13 (was ~41). | [LOCAL ✓] 56 scoring tests + browser run |
| Initial conclusion | It is a **recorded hypothesis**: it can't be changed after submitting, but tags and the initial timeline stay editable until the **official lock** | [LOCAL ✓] database + browser + load |
| Timeline scoring | 6 × coverage + 9 × longest correctly ordered run − 2 per misleading/irrelevant event. Two lucky events = 4.3–5/15. | [LOCAL ✓] |
| Extra time | **This phase** (default) or **whole event**, shown separately in the Control room. Reset clears both. | [LOCAL ✓] |
| Judges | See only assigned teams, and their case + answer key, only from **Closed**. Score only in Closed/Presentations. Frozen after the reveal. | [LOCAL ✓] SQL tests + API + browser |
| State machine | One table (`lib/state-machine.ts`): next step only, one step back with BACK, guards for shortlist/scores; simultaneous clicks refused | [LOCAL ✓] 9 rule tests + browser |
| Supabase safety | Migration `0004_event_rules.sql`, `verify_installation()` + `verify_max_rows()`, `npm run verify:prod` | [LOCAL ✓] also proved it detects RLS off, a re-granted write, a dropped index, Max rows 500 and outdated functions |
| Login capacity | Calculated from teams × devices per team × login window; configurable (`EVENT_DEVICES_PER_TEAM`, `EVENT_LOGIN_WINDOW_MINUTES`, `SUPABASE_AUTH_TOKEN_LIMIT_PER_5MIN`); shown on the dashboard | [LOCAL ✓] |
| Migrations docs | 0001 is **not** re-runnable; 0002–0004 are, **in order** only | [LOCAL ✓] fresh DB + re-runs |
| Cases | CASE-D E01 time label fixed (`03:12` → `03:12:04`); root-cause definitions shown to teams; relevant non-key events neutral in timeline scoring | [LOCAL ✓] validator + audit script |

## 2. Decisions I made because none were given (all changeable)

| # | ASSUMPTION — can be changed later | Where |
|---|---|---|
| A1 | Auto weights 15/15/6/8/6. Evidence-support needs 4 pre-twist relevant citations; a misleading citation cancels 2 correct ones; timeline penalty 2 per wrong event | `POINTS` in `lib/scoring/index.ts` |
| A2 | Evidence-support points only if the final category is right | `scoreEvidenceSupport` |
| A3 | Misleading tagged Irrelevant = half credit; irrelevant tagged Misleading = no penalty | `scoreTaggingParts` |
| A4 | After the initial hypothesis, **both tags and the initial timeline** stay editable until the lock; the final report submission freezes everything | `can_work` (migration 0004) |
| A5 | Per-team extra time defaults to "this phase only" | Control room / `addTeamMinutes` |
| A6 | Judges see teams, cases and answer keys only from Closed onwards and only for assigned teams; scoring is closed at Results | migration 0004 |
| A7 | Skipping phases is impossible except Twist → Closed and Closed → Results; going back is one step only | `lib/state-machine.ts` |
| A8 | Presentations require a shortlist; assigning judges and the shortlist only in Closed/Presentations; shortlisting before judging is complete needs "shortlist anyway" | admin actions |
| A9 | Capacity defaults: 3 devices per team, everyone logs in within 5 min, +15% wrong PINs, ×2 safety | `lib/capacity.ts`, `.env.example` |
| A10 | Root-cause category definitions (wording) | `lib/root-causes.ts` |
| A11 | Teams are told how evidence citations count ("evidence from before the twist counts most; misleading items count against you") | report form |

## 3. Verification status

| Item | Local | Real Supabase/Vercel | Dry run |
|---|---|---|---|
| Migrations 0001–0004 on a fresh DB; 0002–0004 re-run in order | ✓ | run §4 | — |
| `security_checks.sql` (participant isolation, answer keys, judges, locks, deadlines, extra time, reveal freeze) | ✓ | run §4 | — |
| `npm run verify:prod` | ✓ (against local) | run §4 | — |
| Build, lint, typecheck, unit/rule tests, case validator + audit | ✓ | Vercel build | — |
| Browser end-to-end (50 checks), import (13), adversarial (60), session/logout (8), mobile 390 px | ✓ | smoke test §7 | ✓ needed |
| Load: 70 teams × 4 devices, lock racing ~1,500 writes | ✓ | **not tested on hosted Supabase** | Phase 3 |
| Auth rate limit / token-refresh wave | calculated | read the dashboard | Phase 3 (stay logged in > 65 min) |
| Venue Wi-Fi, real laptops/phones, human confusion | — | — | ✓ needed |

## 4. Applying this to the REAL Supabase project  [PROD]

1. **Check first, change nothing** (§5).
2. **SQL Editor → find out what is applied:**

   ```sql
   select
     to_regclass('public.event') is not null                          as m0001,
     to_regprocedure('public.admin_prepare_final()') is not null      as m0002,
     to_regclass('public.work_versions') is not null                  as m0003,
     to_regclass('public.app_schema_version') is not null             as m0004;
   ```

3. **Run only the missing migrations, in order:**
   - 0001 only on an empty project; **never re-run it**.
   - Then 0002, 0003, 0004.
   - Re-running 0002–0004 is safe **in that order**. Never re-run an older one alone after 0004. If you did, re-run 0004.
4. **Run `supabase/tests/security_checks.sql`.** It must print **ALL SECURITY CHECKS PASSED**. It rolls back and changes nothing. Run it in Waiting, not during the event.
5. **Run `select * from verify_installation();`.** Every row must be `ok = true`, including "schema version: applied 1,2,3,4" and "functions are the 0004 versions: current".
6. **On your laptop:** `npm install`, then `npm run verify:prod -- --test-pin`.
   - It needs `.env.local` pointing to the real project.
   - It must show **0 fail**.
   - `--test-pin` creates and immediately deletes one throwaway user, to prove that a 6-digit PIN is accepted.
   - If it says "Could not find the function … in the schema cache", run `NOTIFY pgrst, 'reload schema';` in the SQL Editor and retry.
7. **Cases:** Admin → Cases → delete **CASE-SAMPLE**, then re-upload all 4 JSONs from `cases/` (CASE-D changed).
8. **Never expose:**
   - The secret key (chat, git, screenshots, any `NEXT_PUBLIC_` variable).
   - `.env.local`.
   - `cases/`, `SOLUTIONS.md`, `docs/CASE_AUDIT.md` (keep the repository private).
   - Admin and judge passwords.
   - The logins CSV and printed slips.

## 5. Check in the Supabase dashboard *before* changing anything  [PROD]

I have not seen your dashboard, and menus differ by plan. For each item, note what it actually shows.

| Where | What to check |
|---|---|
| Project home / billing | Plan; whether a Free project pauses when idle (open it the day before); region |
| Authentication → Rate Limits | The exact name, **unit** (per 5 min or per hour) and value of the sign-in / token-refresh limit; whether it is per IP; whether your plan lets you edit it |
| Authentication → Sessions / refresh tokens | Single-session, time-box and inactivity timeout **off**. **Refresh-token reuse interval**: keep the default (I believe 10 s; verify). It tolerates two refreshes at the same moment. My local tests passed even with 0 s. |
| Authentication → Email / passwords | Email provider on; minimum length ≤ 6, no required character classes; leaked-password protection off; "Allow new users to sign up" off (`verify:prod` warns if on) |
| Project Settings → JWT Keys | Access-token expiry (default 3600 s; sets how often the refresh wave comes); legacy secret vs asymmetric keys (legacy means one extra Auth call per page load) |
| Data API settings | Max rows ≥ 1000 (`verify:prod` measures it) |
| Database → Backups | What your plan offers. Otherwise the backup is **Export CSV**. |

## 6. Login rate limit: calculation, not a fixed number

```
needed per 5 min = ceil(teams × devicesPerTeam × burstShare × 1.15 × 2)
burstShare = 1 if everyone logs in within 5 min, else min(1, 10 ÷ loginWindowMinutes)
```

70 teams:

| Devices per team | Everyone within 5 min | Staggered over 30 min |
|---|---|---|
| 1 | 161 | 54 |
| 2 | 322 | 108 |
| 3 | 483 | 161 |
| 4 | 644 | 215 |

- Supabase counts sign-ins **and** token refreshes against this limit. Refreshes come in a similar wave about one token lifetime after the logins.
- The admin dashboard computes the figure for your real team count. Set `EVENT_DEVICES_PER_TEAM` / `EVENT_LOGIN_WINDOW_MINUTES` if your plan differs.
- After you set the limit in Supabase, record it as `SUPABASE_AUTH_TOKEN_LIMIT_PER_5MIN` so the dashboard and `verify:prod` can compare.
- The 150 per 5 min default I quoted earlier comes from my research, not from your dashboard. Verify it.

## 7. Vercel deployment  [PROD]

1. Private GitHub repo. `git ls-files` shows `.env.example` but **not** `.env.local`.
2. Vercel → New Project → import (Next.js, default commands).
3. **Environment variables**, Production scope:

   | Variable | Class |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_TEAM_EMAIL_DOMAIN`, `NEXT_PUBLIC_SITE_URL` | **Public** (built into the browser code) |
   | `SUPABASE_SERVICE_ROLE_KEY` | **Server-only, SENSITIVE** — mark it Sensitive; never `NEXT_PUBLIC_` |
   | `EVENT_DEVICES_PER_TEAM`, `EVENT_LOGIN_WINDOW_MINUTES`, `SUPABASE_AUTH_TOKEN_LIMIT_PER_5MIN` | Server-only, not sensitive |
   | `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_JUDGE_PASSWORD` | **Local only, SENSITIVE** — not on Vercel |

4. Don't give **Preview** deployments the production keys (or disable previews).
5. Settings → Functions → region **Mumbai (bom1)**, if your plan allows it.
6. Deploy. Set `NEXT_PUBLIC_SITE_URL` to the final URL, then **redeploy** (public values are built in).
7. **Deployment Protection:** the production URL must open without a Vercel login.
8. Smoke test:
   - `/` and `/screen` load.
   - Admin login works; the dashboard shows only expected warnings.
   - A dummy team sees "Case sealed".
9. Leak check (§8).
10. Check your plan's function time limit with one 70-row CSV import. [DRY RUN]
11. No deploys on event day.

## 8. Proving the secret key is not in the browser  [PROD]

[LOCAL ✓] Searching this build's browser files for the full secret key found 0 matches.

**Pitfalls when searching (checked on this build):**

- With old-style JWT keys, the first ~30 characters of the public and secret keys are **identical** (the JWT header). Always search for the **end** of the key.
- The text `sb_secret_` appears legitimately inside the Supabase library (a key-format check). A match on it is not a leak.

**A. Automated (PowerShell, on your laptop).** You type the **last 16 characters** of the secret key; they never leave your machine. I have not run this on Windows. Its file pattern matched 10 script files on this build's home page.

```powershell
$site   = "https://YOUR-APP.vercel.app"
$needle = Read-Host "LAST 16 characters of the SECRET key"
$files  = @()
foreach ($p in "/", "/play", "/admin", "/judge", "/screen") {
  $html  = (Invoke-WebRequest "$site$p" -UseBasicParsing).Content
  $files += [regex]::Matches($html, '/_next/static/[^"'' ]+?\.js') | ForEach-Object Value
}
$files = $files | Sort-Object -Unique
foreach ($f in $files) {
  $js = (Invoke-WebRequest "$site$f" -UseBasicParsing).Content
  foreach ($bad in $needle, "SUPABASE_SERVICE_ROLE_KEY") {
    if ($js.Contains($bad)) { Write-Host "FOUND '$bad' in $f" -ForegroundColor Red }
  }
}
"Checked $($files.Count) files."
```

Pass: only "Checked N files", with N > 0.

**B. Logged in (covers lazily loaded scripts).**

1. Log in as admin, then as a team.
2. DevTools → Network → *Disable cache* → reload each page.
3. Press **Ctrl+Shift+F** and search for the last 16 characters of the key. There should be no results.

## 9. Dry run  [DRY RUN]

Use the real deployment and the venue Wi-Fi, with dummy teams. After each phase: **Reset event**, then check that the work is gone and teams and logins are kept.

**Phase 1: 5 devices, organisers only (~1 h).**

- Full flow with 5-minute timers: start → hypothesis → keep tagging → lock → twist → final → close → score → assign → shortlist → presentations → reveal → export → reset.
- Every simulation in the table below, once.

**Phase 2: 20 devices** (6 teams × 3 devices + admin + projector + 2 judges on their own laptops).

- Import a copy of your real registration CSV (with a duplicate, a blank row, a non-English name, a bad email). Print slips, check teams in.
- Two judges score the same team. Check the average, *Save & next*, and the unassigned-team block.
- Shortlist before and after judging completes. Delete ALL teams at the end.

**Phase 3: 50+ devices (~1.5 h).**

- Everyone logs in within 2 minutes; then check Supabase → Authentication → Logs for 429s.
- **Stay logged in more than 65 minutes** to see the token-refresh wave.
- Time from *Release twist* until every screen shows it (target under 15 s).
- Lock while everyone types.
- Watch Supabase Reports and Vercel logs for errors.

| Simulation | How | Expected |
|---|---|---|
| Wi-Fi disconnect | Wi-Fi off 1 min while typing, then on | "No connection…", then "All changes saved" |
| Refresh | F5 after "saved"; F5 while "Saving…" | Content intact; the browser asks before leaving |
| Refresh during a phase change | Keep a team page open while the admin locks | The page turns read-only within ~15 s without a manual refresh |
| Duplicate submit | Double-click; two devices submit together | One submission, same "Submitted at" on both |
| Two devices, same work | Both edit the report; both change one tag | Report: the second device gets the teammate warning, nothing overwritten. Tag: the last click wins. |
| Log out on one device | Device C logs out; A and B keep working for more than 1 hour | A and B unaffected; C logs in again fine |
| Wrong team URL | Team opens `/admin`, `/judge`, another team's evidence link; wrong code | Redirected / not found / "Wrong team code or PIN" |
| Hypothesis then investigate | Submit the hypothesis, then tag and add timeline steps | Tags/timeline still save; report read-only |
| Expired phase + extra time | Timer 0 while typing; give one team **this phase +5**; after the twist check it's gone | "Time up"; only that team saves; not carried over |
| Twist release | Release | New items + prefilled final copy within ~15 s |
| Admin lock during saves | Everyone typing, admin locks | All rows locked; nothing changes afterwards |
| Judge scoring | Judge before Close; after Close; unassigned team; after the reveal | Nothing / assigned only / not found / frozen |
| CSV import | Real export; import again | 0 errors after fixes; second import creates 0 |
| Reset | RESET twice | Work and extra time gone, teams/cases kept, idempotent |
| Admin laptop dies | Close the browser mid-phase, log in elsewhere | The event continues (timers are held by the server) |
| Projector refresh | Reload `/screen` | Recovers without a login |

## 10. Questions still for your team

These defaults are in place, but only you can confirm them.

- **Timing:** phase lengths (75 / 20 / 20); whether Final report is a separate phase; the gap between lock and twist.
- **Official points:** is the total 100 (50 + 50)? Are the new auto weights (A1–A3) acceptable?
- **The twist:** should A-T02 and D-T02 be softened to hints (`docs/CASE_AUDIT.md`)?
- **Devices per team:** 1, 2, 3 or 4? This sets the rate limit.
- **Judging:** top N and judges per team (20 / 2); shortlist size (10); presentation format; a "responsible party" rubric per case.
- **Results:** do teams see their own score? (Currently only the top 10 appear on the projector.)
- **People:** who holds admin (the Driver) and the backup; who owns Supabase/Vercel; individual judge passwords instead of the shared seed password.
- **Reset/archive policy:** who keeps the exported CSVs, and for how long.
