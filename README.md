# The AI Files: Decode the Crime — event platform

Next.js 16 + Supabase. Runs the whole event for 60–70 teams (up to ~300 devices):

| Who | Where | What they can do |
| --- | --- | --- |
| Teams | `/play` | Read the case, open each evidence item in its native look (log, chat, email, table, API response, code, AI output, screenshot), tag it relevant / irrelevant / misleading with notes, build an ordered incident timeline, write and submit the initial conclusion and the final report. Everything autosaves and survives refreshes, flaky Wi-Fi and several teammates on several laptops. |
| Organisers | `/admin` | Import teams from the registration CSV, print credential slips, check teams in, upload/preview cases, run the event phase by phase with a live status table, extend time, unlock a team, auto-score, assign judges, shortlist, export results, reset after a dry run. |
| Judges | `/judge` | See each assigned team's reports, timeline and tags next to the answer key, and score with a rubric ("Save & next team"). |
| Projector | `/screen` | Big timer, phase, "NEW EVIDENCE RELEASED", presentation order, animated top-10 reveal. No login. |

**Event day:** follow [`RUNBOOK.md`](RUNBOOK.md). **Answers:** [`cases/SOLUTIONS.md`](cases/SOLUTIONS.md) (organisers only).

---

## 1. Supabase setup

1. Create a project (region: Mumbai). The Free plan works; see *Capacity* below.
2. **SQL Editor** → run each file in `supabase/migrations/` **in order**, once each. All three are safe to re-run.
   - `0001_init.sql` — tables and security rules
   - `0002_event_operations.sql` — locking, twist release, reset
   - `0003_hardening.sql` — checked write functions, versioning, judge rules, live status, login throttling
3. **SQL Editor** → run `supabase/tests/security_checks.sql`. It plays through the rules as teams, a judge and a visitor inside a transaction and rolls everything back. It must end with `ALL SECURITY CHECKS PASSED`. Run it before the event, not during.
4. **Authentication → Rate Limits** — **required.** Every team login and session refresh goes through the Vercel server, i.e. from one IP address. Supabase's default for the token endpoint (sign-in + refresh) is 150 requests / 5 minutes per IP, which ~280 devices logging in at the start would exceed. Raise the token / sign-in limits to at least **1500 per 5 minutes** for the event.
5. **Authentication → Providers → Email**: keep enabled. Password requirements must allow a 6-digit PIN (minimum length ≤ 6, no "letters required").
6. **Project Settings → API Keys**: copy the URL, the publishable (anon) key and the secret (service role) key for step 2.

## 2. Configuration

Copy `.env.example` to `.env.local` (never commit it):

| Variable | Where it is used | Exposed to browsers? |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | all Supabase clients | yes (public) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser + server clients acting as the user; RLS applies | yes (public by design) |
| `SUPABASE_SERVICE_ROLE_KEY` | `lib/supabase/admin.ts` (server only), seed script | **no — secret** |
| `NEXT_PUBLIC_TEAM_EMAIL_DOMAIN` | internal login emails for teams (`aif-014@<domain>`); no mail is sent | yes |
| `NEXT_PUBLIC_SITE_URL` | printed on credential slips | yes |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_JUDGE_PASSWORD` | `npm run seed` only | no |

## 3. Local development

```bash
npm install
npm run seed        # admin, 2 judges, 10 dummy teams AIF-T01…T10, the 4 event cases (refuses outside "Waiting")
npm run dev         # http://localhost:3000
```

Quality checks:

```bash
npm run test            # scoring tests (all rules × all 4 cases) + case validator
npm run validate:cases  # just the case files
npm run lint            # ESLint (Next.js rules)
npm run typecheck
npm run build           # production build
```

## 4. Deploying (GitHub + Vercel)

1. Push the folder to a **private** GitHub repository (it contains the cases and `SOLUTIONS.md`). `.env.local` is git-ignored.
2. vercel.com → New Project → import the repo. Framework: Next.js (auto).
3. **Settings → Environment Variables**: add every variable from the table above except the `SEED_` ones. Set `NEXT_PUBLIC_SITE_URL` to the Vercel URL (or your domain).
4. **Settings → Functions → Region**: Mumbai (`bom1`), next to the database.
5. Deploy, open the URL, log in as the admin. Only run `npm run seed` against a project that is in Waiting (it creates dummy teams and resets staff passwords).

## 5. How the event runs

Phases (Control room): **Waiting → Investigation → Initial locked → Twist → Final report → Closed → Presentations → Results.** Moving forward is one button; steps that lock work, release the twist or reveal results need "I'm sure"; moving backwards needs the word BACK; results need auto-scores first. The side effects are automatic and idempotent:

| Entering | Effect |
| --- | --- |
| any phase after Investigation | every initial report is locked; never-submitted drafts are "auto-locked" as they are (still scored) |
| Twist or later | twist evidence becomes visible; each team gets an editable copy of its timeline and report |
| Closed or later | every final report is locked, with a snapshot of the team's tags |

Rules enforced by the **database** (not just the UI): a team only sees its own case, never answer keys, other teams, scores or PINs; twist evidence only after release; writes only while the phase is open and before the deadline (+ that team's extension); nothing changes after a stage is submitted; submission time and tag snapshot are set by the server; submitting twice is harmless. Judges score only assigned teams, and presentation scores only for shortlisted teams.

**Reset event** (Control room, type RESET) deletes all tags, timelines, reports, scores, judge scores/assignments and the shortlist, removes extra time and returns to Waiting. It **keeps** teams, logins/PINs, check-ins, cases, answer keys, judges and admins. Running it twice is harmless. To also remove teams after a dry run: Teams → *Delete ALL teams* (Waiting only, type DELETE ALL TEAMS).

## 6. Scoring

| Criterion | Points | How |
| --- | --- | --- |
| Evidence analysis | 15 | Share of evidence tagged like the key (tags frozen when the final report locks) |
| Timeline | 15 | 15 × (0.5 × F1 of the key events placed + 0.5 × share of correctly ordered pairs among them; fewer than 2 key events placed = 0 order credit). Uses the final timeline, else the initial one. |
| Root cause | 10 | Final category = post-twist answer (if the final is empty, the initial category is used) |
| Adaptability | 10 | 10 if the final answer is right; 3 if wrong but changed after the twist; else 0 |
| Responsible party | 10 | Judge, 0–10 |
| Logical reasoning | 15 | Judge, 0–10 × 1.5 |
| Evidence-based conclusion | 10 | Judge, 0–10 |
| Report & presentation | 15 | Judge, shortlist only, 0–10 × 1.5 |

Judge scores are averaged across judges. Ties break on the earlier final submission (auto-locked reports count as last). Rules: `lib/scoring/index.ts`; tests: `scripts/test-scoring.ts`.

**Tag rule shown to teams:** *Relevant* = part of what actually happened, or needed to prove it (even if it looked suspicious); *Misleading* = points toward a wrong explanation and is not part of the real cause; *Irrelevant* = unrelated noise.

## 7. Case file format

See `cases/case-a-217am-incident.json` (event cases) and `cases/examples/sample-case.json` (test only). Top level: `code`, `title`, `briefing_md`, `root_cause_options` (identical for every case), `twist_md`, `evidence[]`, `answer`. Evidence: `code` (E01…, twist items T01…), `type`, `title`, `time_label`, `is_twist`, `content`, `key: { tag, timeline_pos }`.

| `type` | `content` |
| --- | --- |
| `log` | `{ "lines": ["02:17:03 INFO ...", "..."] }` — WARN/ERROR lines are coloured |
| `chat` | `{ "channel": "#ops", "messages": [{ "from": "Rohan", "at": "23:40", "text": "..." }] }` |
| `email` | `{ "from", "to", "cc", "subject", "sent_at", "body_md" }` |
| `db` | `{ "table": "orders", "columns": ["id", "..."], "rows": [["1", "..."]] }` |
| `api` | `{ "method": "GET", "url": "...", "status": 200, "headers": {...}, "body": {...} }` |
| `code` | `{ "filename": "parser.py", "language": "python", "source": "..." }` |
| `screenshot` | `{ "image_url": "/cases/case-a/login.png", "caption": "..." }` — https:// or site-relative only; put files in `public/cases/...` |
| `ai_output` | `{ "model": "...", "prompt": "...", "output": "..." }` |
| `note` | `{ "body_md": "..." }` |

`npm run validate:cases` checks schema, codes, twist items, noise share (25–50%), a gap-free timeline of relevant time-stamped items, answer categories, that the evidence never spells out the answer, identical option lists, and that a perfect team scores 50. Uploading a case with an existing code updates it in place (teams keep their tags); during the event an upload needs an explicit confirmation.

## 8. Capacity notes

- No Realtime websockets: pages poll the one-row `event` table every ~10 s (projector/admin clock every 4 s) with jitter, and re-check when a tab wakes up or the network returns. 300 devices ≈ 30 tiny requests/s. (Supabase Free allows 200 concurrent Realtime connections, which a 300-device event would exceed.)
- Every "read all rows" query pages past Supabase's 1,000-row API limit.
- Tested locally with 70 teams × 4 devices: 840 concurrent tag saves, 280 simultaneous timeline saves (one clean winner per team, the others get a conflict message), 140 simultaneous submits, and an admin lock racing 1,800+ writes — no lost or corrupted data.

## 9. Code map

| Path | What |
| --- | --- |
| `app/play`, `components/play` | Team portal (board, evidence, timeline, report, autosave with retry + conflict detection) |
| `components/evidence` | Evidence renderers per type |
| `app/admin`, `components/admin` | Organiser screens; `lib/admin-action.ts` shows results/errors after each action |
| `app/judge` | Judge screens |
| `app/screen`, `components/ScreenView.tsx` | Projector |
| `app/actions/*` | Server actions (team, admin, judge, auth) |
| `lib/scoring`, `lib/results.ts`, `lib/status.ts` | Scoring rules, leaderboard, live team status |
| `lib/cases` | Case schema + loader |
| `supabase/migrations`, `supabase/tests` | Database, security rules, event operations, security test |
| `proxy.ts`, `lib/supabase` | Session refresh, role routing, Supabase clients |
