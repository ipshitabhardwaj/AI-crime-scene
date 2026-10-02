# The AI Files: Decode the Crime — event platform

Next.js 16 + Supabase. Runs the whole event for 60–70 teams (up to ~300 devices):

| Who | Where | What they can do |
| --- | --- | --- |
| Teams | `/play` | Read a short case (picture, story, suspects), answer multiple-choice questions (one clue per question), submit an Initial Conclusion (who did it and why), then after the twist answer a few new questions and submit the Final Report. No technical knowledge needed. Everything autosaves and survives refreshes, flaky Wi-Fi and several teammates on several laptops. |
| Organisers | `/admin` | Import teams from the registration CSV, print credential slips, check teams in, upload/preview cases, run the event phase by phase with a live status table, extend time, unlock a team, auto-score, assign judges, shortlist, export results, reset after a dry run. |
| Judges | `/judge` | After submissions close: see each assigned team's two reports and question answers next to the answer key, and score with a rubric ("Save & next team"). |
| Projector | `/screen` | Big timer, phase, "NEW EVIDENCE RELEASED", presentation order, animated top-10 reveal. No login. |

**Event day:** follow [`RUNBOOK.md`](RUNBOOK.md). **Answers:** [`cases/SOLUTIONS.md`](cases/SOLUTIONS.md) (organisers only).

---

## 1. Supabase setup

1. Create a project (region: Mumbai). The Free plan works; see *Capacity* below.
2. **SQL Editor** → run the files in `supabase/migrations/` **in order**, once each:
   - `0001_init.sql` — tables and security rules. **Not re-runnable**: running it again stops at its first line (`type "app_role" already exists`) and changes nothing. Run it only on an empty project.
   - `0002_event_operations.sql` — locking, twist release, reset
   - `0003_hardening.sql` — checked write functions, versioning, judge rules, live status, login throttling
   - `0004_event_rules.sql` — initial hypothesis + investigation until the lock, per-phase extra time, new score columns, judge access after close only, self-checks
   - `0005_reset_fix.sql` — optional: lets *Reset event* run as one database transaction on hosted Supabase (without it the app does the same reset step by step)
   0002–0004 are safe to re-run **in order**. Never re-run an older one on its own after a newer one: 0002 would bring back old function versions (0004's self-check reports this as "functions are the 0004 versions: outdated"). If that happens, re-run 0004.
3. **SQL Editor** → run `supabase/tests/security_checks.sql`. It plays through the rules as teams, a judge and a visitor inside a transaction and rolls everything back. It must end with `ALL SECURITY CHECKS PASSED`. Run it before the event, not during.
4. **Authentication settings** — check before changing anything (`docs/PRE_PRODUCTION_CHECKLIST.md` §14–16):
   - **Rate Limits:** sign-ins and token refreshes of every team arrive from one place (Vercel / the campus IP). Size the limit with the formula in §16, or read the recommendation on the admin dashboard. It depends on teams × devices per team and on how staggered logins are, **not** a fixed 1500.
   - **Email provider** enabled; password rules must allow a 6-digit PIN; leaked-password protection off; "Allow new users to sign up" off (imports use the admin API).
   - **Sessions:** single-session-per-user, time-box and inactivity timeout off (teams share one login on several devices).
5. **Project Settings → API Keys**: copy the URL, the publishable (anon) key and the secret (service role) key.
6. On your laptop: `npm run verify:prod` (add `-- --test-pin` to test the PIN rule for real). It checks env vars, migration version, RLS, grants, indexes, the API *Max rows* cap and Auth settings, and lists what only the dashboard can show.

## 2. Configuration

Copy `.env.example` to `.env.local` (never commit it):

| Variable | Where it is used | Exposed to browsers? |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | all Supabase clients | yes (public) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser + server clients acting as the user; RLS applies | yes (public by design) |
| `SUPABASE_SERVICE_ROLE_KEY` | `lib/supabase/admin.ts` (server only), seed script | **no — secret** |
| `NEXT_PUBLIC_TEAM_EMAIL_DOMAIN` | internal login emails for teams (`aif-014@<domain>`); no mail is sent | yes |
| `NEXT_PUBLIC_SITE_URL` | printed on credential slips | yes |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_JUDGE_PASSWORD` | `npm run seed` only (never on Vercel) | no — secret |
| `EVENT_DEVICES_PER_TEAM`, `EVENT_LOGIN_WINDOW_MINUTES`, `SUPABASE_AUTH_TOKEN_LIMIT_PER_5MIN` | login-capacity check on the dashboard and in `verify:prod` (optional; defaults 3 / 5 / not recorded) | no |

## 3. Local development

```bash
npm install
npm run seed        # admin, 2 judges, 10 dummy teams AIF-T01…T10, the 4 event cases (refuses outside "Waiting")
npm run dev         # http://localhost:3000
```

Quality checks:

```bash
npm run test            # scoring + event-rule tests, case validator, case audit
npm run validate:cases  # just the case files
npm run audit:cases     # fairness metrics per case (docs/CASE_AUDIT.md)
npm run verify:prod     # production self-check against the project in .env.local
npm run lint            # ESLint (Next.js rules)
npm run typecheck
npm run build           # production build
```

## 4. Deploying (GitHub + Vercel)

1. Push the folder to a **private** GitHub repository (it contains the cases and `SOLUTIONS.md`). `.env.local` is git-ignored.
2. vercel.com → New Project → import the repo. Framework: Next.js (auto).
3. **Settings → Environment Variables** (scope: Production): add every variable from the table above except the `SEED_` ones. Mark `SUPABASE_SERVICE_ROLE_KEY` **Sensitive**. Set `NEXT_PUBLIC_SITE_URL` to the Vercel URL (or your domain), then redeploy (public values are built in). Don't give Preview deployments the production keys.
4. **Settings → Functions → Region**: Mumbai (`bom1`), next to the database.
5. Deploy, open the URL, log in as the admin. Only run `npm run seed` against a project that is in Waiting (it creates dummy teams and resets staff passwords).

## 5. How the event runs

Phases (Control room): **Waiting → Investigation → Initial locked → Twist → (Final report) → Closed → Presentations → Results.** The full permission matrix is in [`docs/STATE_MACHINE.md`](docs/STATE_MACHINE.md).

- Only the next step can be clicked; skipping is impossible (except Twist → Closed and Closed → Results).
- Locking, the twist, closing and the reveal need "I'm sure".
- Going back one step needs the word BACK and never unlocks work.
- Presentations need a shortlist; Results need auto-scores.

| Entering | Effect |
|---|---|
| Initial locked (or later) | **Official lock**: every Initial Conclusion and every round-1 answer is locked; never-submitted drafts are "auto-locked" (still scored) |
| Twist or later | the twist questions become visible; each team's Final Report starts as a copy of its Initial Conclusion |
| Closed or later | every Final Report is locked; judges can see their assigned teams |
| Results | judges can no longer change scores |

**Initial Conclusion.** Submitting it records the team's first answer (scored as the "initial hypothesis"): it can never be changed. The team **can still change its question answers until the official lock**. The Final Report after the twist is a separate document; submitting it ends all editing.

**Extra time.** `+5` on Live status applies to **the current phase only** (default). *Whole event* adds time to every remaining deadline. Both are cleared by Reset.

Rules enforced by the **database**, not just the UI:

- A team only sees its own case, never answer keys, other teams, scores or PINs.
- Twist questions are visible only after release.
- Writes are accepted only while allowed (see above) and before the team's deadline.
- Submission time is set by the server; submitting twice is harmless.
- Judges see only their assigned teams (work, case, answer key), only from Closed.
- Judges score only in Closed/Presentations, and presentation scores only for shortlisted teams.

**Logging out** ends only that device's session; teammates on other laptops stay logged in.

**Reset event** (Control room → *More options* → *Danger zone*, type RESET; or from the terminal: `npm run reset -- RESET`):

- Deletes all answers, reports, scores, judge scores/assignments, the shortlist and all extra time, and returns to Waiting.
- **Keeps** teams, logins/PINs, check-ins, cases, answer keys, judges and admins.
- Running it twice is harmless.
- To also remove teams after a dry run: Teams → *Delete ALL teams* (Waiting only, type DELETE ALL TEAMS).

## 6. Scoring

**100 = 50 automatic + 50 judges.** Full rules and measured results are in [`docs/SCORING.md`](docs/SCORING.md).

| Criterion | Points | Who |
| --- | --- | --- |
| Questions, round 1 (8 × 3) | 24 | Auto |
| Twist questions (3 × 4) | 12 | Auto |
| Initial Conclusion names the real culprit | 6 | Auto |
| Final Report names the real culprit | 8 | Auto |
| Right culprit, clearly named | 10 | Judge |
| Logical reasoning | 15 | Judge |
| Use of clues | 10 | Judge |
| Presentation (shortlist only) | 15 | Judge |

No negative marking. Round-1 answers are frozen at the lock. Ties break on the earlier final submission (auto-locked reports count as last).

## 7. Case file format

See `cases/case-a-locked-room.json` (event cases) and `cases/examples/sample-case.json` (tiny example). A case is plain JSON:

| Field | What |
| --- | --- |
| `code`, `title` | e.g. `CASE-A`, "The Locked Room". The picture is chosen by code (`components/CaseArt.tsx`); unknown codes get a generic picture |
| `briefing_md` | The short story (under ~220 words) |
| `suspects` | 3–5 names (the event cases have 3), shown on the case page and as the choices in the report |
| `questions[]` | Round 1. Each: `code` (Q1…), `clue: { label, title, text }`, `question`, `options` (exactly 4), `answer` (1–4) |
| `twist_md` | One sentence announcing the new evidence |
| `twist_questions[]` | Same shape, coded T1… Hidden until the twist |
| `answer` | `first_suspect` (who the story points to), `culprit` (scored), `explanation` (shown to judges) |

`npm run validate:cases` checks the format, question counts, four different options, and that a perfect team scores 50. `npm run audit:cases` checks that correct answers are spread over A–D and are not always the longest option. Uploading a case with an existing code updates it in place (teams keep their answers); during the event an upload needs an explicit confirmation.

**How it is stored (no extra migration):** each question is a row in the `evidence` table, the correct option is `answer_evidence.timeline_pos`, the suspects are `cases.root_cause_options`, and a team's answer is a row in `evidence_tags` whose `note` holds the letter A–D. The timeline tables are unused.

## 8. Capacity notes

- **No Realtime websockets.** Pages poll the one-row `event` table every ~10 s (projector/admin clock every 4 s), with jitter, and re-check when a tab wakes up or the network returns. Polling uses the public key without a login session. 300 devices ≈ 30 tiny requests/s. (Supabase Free allows 200 concurrent Realtime connections, which a 300-device event would exceed.)
- **Session refresh happens only on the server** (`proxy.ts`), never in the browser, so two refreshers can't race on a shared team login.
- **Every "read all rows" query pages** past the API's 1,000-row limit. The project's *Max rows* setting must be ≥ 1000 (`verify:prod` checks it).
- **Login capacity:** sign-ins + token refreshes per 5 minutes ≈ teams × devices per team × share logging in within 5 minutes × 1.15 (wrong PINs) × 2 (safety). With 70 teams, all logging in at once, this is 161 (1 device), 322 (2), 483 (3) or 644 (4). Staggered over 30 minutes it is about a third of that. The admin dashboard shows the figure for your team count.
- **Tested locally** (Postgres 16 + GoTrue + PostgREST, not hosted Supabase) with 70 teams × 4 devices:
  - 840 concurrent answer saves (measured on the earlier evidence-board version; the quiz uses the same save path).
  - 140 simultaneous submits.
  - An admin lock racing about 1,500 writes: nothing accepted or changed after the lock.

## 9. Code map

| Path | What |
| --- | --- |
| `app/play`, `components/play` | Team portal (case page, one-question-per-screen quiz, short report, autosave with retry + conflict detection) |
| `components/CaseArt.tsx`, `components/CrimeTape.tsx` | Case pictures and the crime-scene tape |
| `app/admin`, `components/admin` | Organiser screens; `lib/admin-action.ts` shows results/errors after each action |
| `app/judge` | Judge screens |
| `app/screen`, `components/ScreenView.tsx` | Projector |
| `app/actions/*` | Server actions (team, admin, judge, auth) |
| `lib/scoring`, `lib/results.ts`, `lib/status.ts` | Scoring rules, leaderboard, live team status |
| `lib/state-machine.ts` | Allowed phase changes (single source of truth) |
| `components/ui.tsx`, `lib/ui.ts`, `lib/journey.ts` | Shared UI building blocks (page header, stepper, "what to do now" card), a team's step-by-step journey |
| `lib/capacity.ts`, `scripts/verify-production.ts` | Login capacity plan, production self-check |
| `docs/` | Pre-production checklist, organiser one-pager, scoring, state machine, case audit |
| `lib/cases` | Case schema + loader |
| `supabase/migrations`, `supabase/tests` | Database, security rules, event operations, security test |
| `proxy.ts`, `lib/supabase` | Session refresh, role routing, Supabase clients |
