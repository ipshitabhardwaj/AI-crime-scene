# Event state machine (authoritative)

The platform has **8 phases**. The code definition is `lib/state-machine.ts`, used by the Control room and by `setPhase`. The database enforces the permissions (migrations 0003–0004), and they are tested by `supabase/tests/security_checks.sql` and `scripts/test-rules.ts`.

The requested "JUDGING / SHORTLIST / ARCHIVED" steps are not separate phases:

- Judging and the shortlist happen inside **Closed**.
- **Archive** means *Export CSV*, then *Reset event*.

```
WAITING ──▶ INVESTIGATION ──▶ INITIAL LOCKED ──▶ TWIST ──▶ FINAL REPORT ──▶ CLOSED ──▶ PRESENTATIONS ──▶ RESULTS
                                                   └───────────────────────────▶ CLOSED ─────────────────────▶ RESULTS
                                                   (Final report is optional)          (no presentations)
Back: only to the previous phase, only after typing BACK. It never unlocks locked work.
```

## Transitions

| From → To | Needs | Side effects (idempotent) |
|---|---|---|
| Waiting → Investigation | "I'm sure" only if a team has no case | Cases open; timer (default 75 min) |
| Investigation → Initial locked | "I'm sure" | **Official lock**: waits for in-flight saves, then locks every initial report, tag and initial timeline. Drafts become "auto-locked". Tags are snapshotted. |
| Initial locked → Twist | "I'm sure" | Twist released; each team gets an editable copy of its timeline and report |
| Twist → Final report | — | New timer only |
| Twist or Final → Closed | "I'm sure" | Every final report locked; tags snapshotted |
| Closed → Presentations | A shortlist exists | Projector shows the order |
| Closed or Presentations → Results | "I'm sure" + auto-scores exist | Projector reveal; judge scores frozen |
| Any → previous phase | Type BACK | Before the twist: twist hidden again. Locks stay. |
| Anything else (skipping) | **Refused** | — |

Two organisers clicking at once: the second click fails with "Someone else changed the phase" instead of applying twice.

## Permissions per phase

"Deadline" = phase timer + that team's extra time. Extra time applies to the current phase only, unless it was given as a whole-event extension.

| Phase | Team can write | Team can read | Admin | Judge sees | Judge scores | Auto-scoring | Answer key visible to |
|---|---|---|---|---|---|---|---|
| Waiting | nothing | own team row | everything; import/delete teams and cases; seed | nothing | no | — | admin |
| Investigation | tags, initial timeline, initial report (until deadline). **After submitting the hypothesis: tags and timeline only.** | own case (no twist items) + own work | timer, ±time, unlock initial, case upload (with confirmation) | nothing | no | provisional only (confirmation) | admin |
| Initial locked | nothing | same | next step, back | nothing | no | provisional | admin |
| Twist | tags, final timeline, final report, until the final submission or the deadline | + twist items and twist text | timer, ±time, unlock final | nothing | no | provisional | admin |
| Final report | same as Twist | same | same | nothing | no | provisional | admin |
| Closed | nothing | same | auto-score, assign judges, shortlist, export | assigned teams: work, case, answer key | yes (assigned; presentation only if shortlisted) | yes | admin + assigned judges |
| Presentations | nothing | same + whether shortlisted | shortlist, assign, export | same | yes | yes | admin + assigned judges |
| Results | nothing | same (teams never see scores in the app) | export, reset | same (read-only) | **no** | yes | admin + assigned judges |

Rules that hold in every phase:

- Participants never see answer keys, other teams, scores or PINs.
- The public projector (`/screen`) sees only the event row, plus team names and totals in Presentations and Results.
