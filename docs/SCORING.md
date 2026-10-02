# Scoring

**Total 100 = 50 automatic + 50 judges.** The automatic part is computed from the answer key when an organiser clicks *Run auto-scoring* (safe to repeat). The code is in `lib/scoring/index.ts`, the tests in `scripts/test-scoring.ts` (`npm run test:scoring`).

## Automatic 50

| Part | Max | Rule |
|---|---|---|
| **Questions, round 1** | 24 | 8 questions, 3 points each. Share of correct answers × 24 |
| **Twist questions** | 12 | 3 questions, 4 points each. Share of correct answers × 12 |
| **Initial Conclusion** | 6 | The team named the real culprit *before* the twist |
| **Final Report** | 8 | The team named the real culprit in the Final Report |

- No negative marking. An unanswered question scores 0.
- Round-1 answers are frozen at the lock. If a round-1 answer is changed after the twist was released (the app does not allow it; only a hand-made request could), that question scores 0.
- A team that never touches the Final Report keeps its Initial Conclusion as its final answer.
- Guessing: picking the same letter for every question gets about a quarter of the question points.

Typical outcomes:

| Team | Score |
|---|---|
| Everything right, named the real culprit from the start | 50 |
| Everything right, fell for the first suspect, corrected after the twist | 44 |
| Half of the questions right, corrected after the twist | about 26 |
| Did nothing | 0 |

## Judges 50

| Criterion | Max | Rule |
|---|---|---|
| Right culprit, clearly named | 10 | Judge score 0–10 × 1 |
| Logical reasoning | 15 | Judge score 0–10 × 1.5 |
| Use of clues | 10 | Judge score 0–10 × 1 |
| Presentation | 15 | Judge score 0–10 × 1.5, shortlisted teams only |

- Judges read the two short reports (who did it + how the team knows) and see the team's answers next to the key.
- Each criterion is averaged over the judges who entered it. Teams not assigned to any judge get 0 for the judge part.
- Judges see and score assigned teams only, only from *Closed*, and can no longer change scores after *Reveal results*.

## Final total and ties

- **Final total** = auto (0–50) + judges (0–50).
- Ties are broken by the earlier Final Report submission time.

## Where the numbers are stored

The quiz reuses the original database tables (no new migration). In `auto_scores`: `tagging` = round-1 questions, `timeline` = twist questions, `hypothesis` = Initial Conclusion, `root_cause` = Final Report, `evidence_support` = always 0.
