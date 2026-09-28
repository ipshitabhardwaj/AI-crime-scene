# Event-day runbook — The AI Files

One organiser drives the **Control room** on a laptop; one person runs the check-in desk (Teams page); the projector shows `/screen`. Keep `cases/SOLUTIONS.md` printed for judges only.

## The day before

- [ ] Migrations 0001–0003 applied; `supabase/tests/security_checks.sql` ends with **ALL SECURITY CHECKS PASSED**.
- [ ] Supabase **Authentication → Rate Limits**: token/sign-in limit raised to ≥ 1500 per 5 min.
- [ ] Vercel env vars set, `NEXT_PUBLIC_SITE_URL` correct, function region Mumbai.
- [ ] Cases: the 4 event cases uploaded and previewed; **CASE-SAMPLE deleted**; dashboard shows no warnings about cases.
- [ ] Full dry run done with 5–10 people on the venue Wi-Fi, then **Reset event** and **Delete ALL teams** (or delete dummy teams).
- [ ] Registration CSV imported (Teams → Import). Result shows *Errors: 0* (fix and re-import otherwise). Rebalance cases if needed.
- [ ] Credential slips printed (Teams → Credential slips → Print) and cut, sorted by team code. Also click **Download new logins (CSV)** after importing and keep it offline.
- [ ] Judges have their logins (`judge1@…`, `judge2@…`); more judges = run the seed or add users in Supabase with a `profiles` row of role `judge`.

## T-60 min

- [ ] Admin logged in on the control laptop (charger plugged in). Open **Dashboard**: phase **Waiting**, 0 warnings.
- [ ] Projector: open `/screen` full-screen. Shows "Waiting".
- [ ] Check-in desk: Teams page open; search each arriving team, click **Check in**, hand over the slip.
- [ ] Spot registrations: Teams → *Add one team manually* → the new code + PIN appear at the top of the page; write them on a blank slip.

## T-30 min

- [ ] Every team logs in on at least one laptop (they see "Case sealed"). Check the Control room table: teams without a login or case are marked in red.
- [ ] Brief teams: *one person edits the timeline, one the report* (other devices can read and tag). Show the tag rule under "What do these mean?".

## T-10 min

- [ ] Control room: confirm the timer value for step 1 (default 75 min).
- [ ] Lost PIN → Teams → More → **Reset PIN** (also clears the 5-minute lock after 8 wrong PINs).

## START

- [ ] **1 · Start investigation → Go.** The flash message confirms. Teams' pages switch within ~10 s; the projector shows the countdown.

## +15 min

- [ ] Control room table: every team shows tags > 0 and "Last activity" recent. Walk to teams showing nothing.
- [ ] Laptop died / team lost time → **+5** in that team's row (only that team gets the time).
- [ ] Everyone needs more time → **Extend deadline for everyone**.

## End of investigation

- [ ] When the timer hits 0, writes stop automatically. **2 · Lock initial answers** (tick *I'm sure*). Unsubmitted drafts become "auto-locked" and are still scored.

## TWIST

- [ ] **3 · Release the twist** (tick *I'm sure*, 20 min). Projector shows NEW EVIDENCE RELEASED; teams see the new items marked NEW and an editable copy of their timeline and report.
- [ ] **4 · Final report** (20 min) when the organisers announce it (optional; teams can already edit in Twist).

## CLOSE

- [ ] **5 · Close submissions** (tick *I'm sure*). Control room: "Final submitted" count; the rest are auto-locked.

## SCORING

- [ ] Results → **Run auto-scoring** (safe to re-run). Leaderboard fills.
- [ ] **Export CSV** immediately (backup).

## JUDGING

- [ ] Results → **Assign judges** (top 20, 2 per team). Judges open `/judge`, use **Save & next team**.
- [ ] Watch "Judging: X/Y assigned teams fully scored" on the Results page.

## SHORTLIST

- [ ] Results → **Create shortlist** (top 10). Re-creating it later requires ticking *replace*.
- [ ] **6 · Presentations**: projector shows the order. Judges enter *Report & presentation* scores (field appears only for shortlisted teams).

## REVEAL

- [ ] Final **Export CSV**. **7 · Reveal results** (tick *I'm sure*). Projector reveals 10th → 1st over ~15 s.

## RESET / ARCHIVE

- [ ] Keep the exported CSVs. Only after that: Reset event / Delete all teams if the platform will be reused.

---

## Emergencies

| Problem | Do this |
| --- | --- |
| A team says "Did my submission go through?" | Their Report page shows a green **"Submitted at HH:MM — received and locked"**. Control room shows *submitted*. If they saw "couldn't confirm", pressing Submit again is safe (never duplicates). |
| Team submitted by mistake | Control room → *unlock* next to their status (only while that phase is running). They must submit again. |
| "A teammate changed this on another device" | Two laptops edited the same timeline/report. Nothing was overwritten; they click *load the latest version*. Ask one person to edit. |
| "No connection" message on a team laptop | Their edits are kept and saved automatically when Wi-Fi returns. Don't close the tab. |
| Team can't log in: "Too many wrong attempts" | Wait 5 min, or Teams → More → Reset PIN (new PIN shown at the top). |
| "The login server is busy" | Supabase rate limit: ask teams to wait 30 s. Raise the limit in Supabase → Authentication → Rate Limits. |
| Timer was set wrongly | Control room → *Change timer* (minutes from now) or *Extend deadline*. Never press an earlier step. |
| Twist released too early | Step *3* shows "done"; going back requires typing BACK and hides the twist again, but already-locked initial reports stay locked. Prefer to continue. |
| Wrong answer key found during the event | Fix the JSON, Cases → upload (tick the in-progress confirmation), then **Run auto-scoring** again. |
| Projector frozen | Refresh `/screen`. It needs no login. |
| Vercel/Supabase down | Hand out the printed case copies and paper report forms; score by hand from `SOLUTIONS.md`. |
| Admin page shows an error | The red box shows the reason. For "This page could not be loaded", note the error reference and check Vercel → Logs. |
