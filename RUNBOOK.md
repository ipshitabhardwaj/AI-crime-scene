# Event-day runbook — The AI Files

**Roles**

- One organiser (the **Driver**) runs the **Control room** on a laptop.
- One person runs the check-in desk (Teams page).
- The projector shows `/screen`.

Keep `cases/SOLUTIONS.md` printed, and hand it to judges **at CLOSE**. Judges can't see answer keys in the app before then either.

A one-page printable version is in `docs/organizer-checklist.pdf`. The phase rules are in `docs/STATE_MACHINE.md`.

## The day before

- [ ] Migrations 0001–0004 applied.
- [ ] `supabase/tests/security_checks.sql` ends with **ALL SECURITY CHECKS PASSED**.
- [ ] `npm run verify:prod` shows 0 FAIL.
- [ ] Supabase **Authentication → Rate Limits** is at least the figure on the admin dashboard ("Login capacity"). The figure depends on teams × devices per team.
- [ ] That limit is recorded as `SUPABASE_AUTH_TOKEN_LIMIT_PER_5MIN` in Vercel, so the warning disappears.
- [ ] Vercel env vars set, `NEXT_PUBLIC_SITE_URL` correct, function region Mumbai. No deploys planned for event day.
- [ ] The 4 event cases uploaded (latest JSON) and previewed.
- [ ] **CASE-SAMPLE deleted.** The dashboard shows no case warnings.
- [ ] Full dry run done (see the dry-run plan in `docs/PRE_PRODUCTION_CHECKLIST.md` §20), then **Reset event** and **Delete ALL teams** (or delete the dummy teams).
- [ ] Registration CSV imported (Teams → Import). The result shows *Errors: 0*; fix and re-import otherwise. Rebalance cases if needed.
- [ ] Credential slips printed (Teams → Credential slips → Print), cut and sorted by team code.
- [ ] **Download new logins (CSV)** clicked after importing; the file is kept offline.
- [ ] Judges have their logins. For more judges, run the seed or add users in Supabase with a `profiles` row of role `judge`.

## T-60 min

- [ ] Admin logged in on the control laptop, charger plugged in.
- [ ] Setup page: phase **Waiting**, every checklist item green.
- [ ] Projector: `/screen` open full-screen, showing "Waiting".
- [ ] Check-in desk: Teams page open. For each arriving team: search, click **Check in**, hand over the slip.
- [ ] Walk-in team: Teams → *Add one team manually*. The code and PIN appear at the top of the page.

## T-30 min

- [ ] Teams log in, **staggered** as they check in (this keeps the login burst small). **Live status** marks teams without a login or case in red.
- [ ] Brief the teams:
  - One person edits the timeline, one the report.
  - The **How to play** button explains everything; each tag shows its meaning next to it.
  - **Submit your Initial Conclusion before the lock.** It can't be changed afterwards, but you keep tagging and building the timeline until the lock.
  - Key evidence you cite, from before the twist, counts.

## T-10 min

- [ ] Step 1 timer checked (default 75 min).
- [ ] Only the Driver clicks phase buttons.

## START

- [ ] Control room → the **Next step** card shows **1 · Start investigation** → **Go**. (The Next step card always shows the only step you can start.)
- [ ] The flash message confirms. Team pages switch within ~10 s. The projector shows the countdown.

## +15 min

- [ ] **Live status**: every team shows tags > 0 and a recent "Last activity". Walk over to teams showing nothing.
- [ ] A laptop died or a team lost time → **this phase +5** in that team's row on Live status. It applies to this phase only. The team's open pages update by themselves within ~15 s and show "+5 min extra time".
- [ ] Only use **whole event +5** when a team should get extra time in every remaining phase.
- [ ] Everyone needs more time → **Extend deadline for everyone**.

## LOCK (end of investigation)

- [ ] When the timer hits 0, writing stops automatically.
- [ ] **2 · Lock initial stage** (tick *I'm sure*). Every Initial Conclusion, tag and initial timeline is locked. Unsubmitted drafts become "auto-locked" and are still scored.

## TWIST

- [ ] **3 · Release the twist** (tick *I'm sure*, 20 min).
- [ ] The projector shows NEW EVIDENCE RELEASED. Teams see the new items marked NEW, plus an editable copy of their timeline and report.

## FINAL SUBMISSION

- [ ] Optional: **4 · Final report** (new 20 min timer). Same rights as the twist phase.
- [ ] Remind teams: press **Submit**, then look for the green "Submitted at".

## CLOSE

- [ ] **5 · Close submissions** (tick *I'm sure*).
- [ ] Live status: note the "Final submitted" count. The rest are auto-locked.
- [ ] Hand the printed SOLUTIONS to the judges.

## SCORING

- [ ] Results → **Run auto-scoring** (safe to re-run). The leaderboard fills.
- [ ] **Export CSV** immediately, as a backup.

## JUDGING

- [ ] Results → **Assign judges** (top 20, 2 per team).
- [ ] Judges open `/judge` and use **Save & next team**. They see only their assigned teams.
- [ ] Watch "Judging: X/Y assigned teams fully scored" on the Results page.

## SHORTLIST

- [ ] When judging shows Y/Y: Results → **Create shortlist** (top 10).
  - Before judging is complete, it asks for "shortlist anyway".
  - Re-creating it asks for "replace".
- [ ] **6 · Presentations**. The projector shows the order. Judges enter *Report & presentation* scores (shortlisted teams only).

## REVEAL

- [ ] Final **Export CSV**.
- [ ] **7 · Reveal results** (tick *I'm sure*). The projector reveals 10th → 1st over ~15 s. Judge scores are now frozen.

## ARCHIVE / RESET

- [ ] Keep the exported CSVs in two places.
- [ ] Only after that: Reset event (Control room → More options → Danger zone) / Delete ALL teams, if the platform will be reused.

---

## Emergencies

| Problem | Do this |
| --- | --- |
| "Did my submission go through?" | Their Report page shows a green **"Submitted at HH:MM — received and locked"**, and Live status shows *submitted*. If they saw "couldn't confirm", pressing Submit again is safe (it never duplicates). |
| Submitted by mistake | Live status → *unlock* next to their status. This works only while that phase is running. Within ~15 s their pages show "Editing reopened"; they must submit again. |
| "A teammate changed this on another device" | Two laptops edited the same timeline or report. Nothing was overwritten: they copy their text, click *load the latest version*, and one person edits. (Tags: the last click wins.) |
| "No connection" on a team laptop | Edits are kept and saved automatically when Wi-Fi returns. Don't close the tab. |
| Team can't log in: "Too many wrong attempts" | Wait 5 min, or Teams → More → Reset PIN (the new PIN is shown at the top). |
| "The login server is busy" | Supabase rate limit. Ask teams to wait 30 s and log in one device at a time. The owner raises the limit in Supabase → Authentication → Rate Limits. |
| Someone pressed "Log out" | Only that laptop is logged out; the teammates carry on. Log in again with the same code + PIN. |
| One team's data isn't saving | Read their save indicator: *No connection* (Wi-Fi), *teammate changed this* (see above), or *Time is up / locked*. For the last one, give **this phase +5** or *unlock* if that is fair. |
| Timer was set wrongly | Control room → *More options* → *Change timer* (minutes from now) or *Extend deadline*. |
| Clicked the wrong phase | Stop. Only the next step or one step back exists. Going back needs BACK and doesn't unlock work; usually it's better to continue. Two people clicking at once: the second gets "Someone else changed the phase". |
| Judge "not assigned" or sees nothing | Before Close, judges see nothing by design. After Close: Results → *Assign judges* again (scores are kept), or check that the team is in the top N. The presentation box appears only for shortlisted teams. |
| Wrong answer key found during the event | Fix the JSON, Cases → upload (tick the in-progress confirmation), then **Run auto-scoring** again. |
| Projector frozen | Refresh `/screen`. It needs no login. |
| Vercel/Supabase down | Hand out the printed case copies and paper report forms; score by hand from `SOLUTIONS.md` and `docs/SCORING.md`. |
| Admin page shows an error | The red box shows the reason. For "This page could not be loaded", note the error reference and check Vercel → Logs. |
