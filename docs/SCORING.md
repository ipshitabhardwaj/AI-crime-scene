# Scoring (final rules)

**Total 100 = 50 automatic + 50 judges.** The automatic part is deterministic. It is computed from the answer key when an organiser clicks *Run auto-scoring*. The code is in `lib/scoring/index.ts` and the tests are in `scripts/test-scoring.ts`.

> ASSUMPTION — can be changed later: the weights below were chosen by me because no official breakdown was given. Each weight is one constant in `POINTS` (`lib/scoring/index.ts`).

## Automatic 50

| Part | Max | Rule |
|---|---|---|
| **Evidence analysis** | 15 | Relevance (10) plus red-herring detection (5), see below |
| **Timeline** | 15 | 6 × COVERAGE + 9 × ORDERED − 2 per wrong event, floored at 0 |
| **Initial hypothesis** | 6 | The initial (pre-twist) category is already the real one |
| **Root cause** | 8 | The final category is the real one. If the final category is empty, the initial one is used. |
| **Evidence support** | 6 | Only if the final category is right: 6 × clamp((GOOD − 2 × BAD) ÷ 4, 0, 1) |

### Evidence analysis (15)

**Relevance (10)** = 10 × max(0, TPR + TNR − 1)

- TPR = relevant items tagged *Relevant* ÷ all relevant items.
- TNR = misleading and irrelevant items tagged *Misleading* or *Irrelevant* ÷ all such items.
- Tagging everything the same, or at random, scores about 0.

**Red herrings (5)** = 5 × max(0, HIT − FALSE_ALARM)

- HIT = (misleading items tagged *Misleading* + ½ × misleading items tagged *Irrelevant*) ÷ misleading items.
- FALSE_ALARM = (relevant items tagged *Misleading* + ½ × relevant items tagged *Irrelevant*) ÷ relevant items.

Other details:

- Untagged items earn nothing.
- An irrelevant item tagged *Misleading* costs nothing (it is noise either way).
- A misleading item tagged *Irrelevant* costs about 0.6.
- Falling for a red herring (tagging it *Relevant*) costs about 2.9.
- Tags are frozen at the final submission or the final lock.

### Timeline (15)

- **COVERAGE** = key events placed ÷ key events (A: 7, B/C/D: 6).
- **ORDERED** = the longest run of placed key events in the correct relative order ÷ key events.
- **Wrong event** = a step whose evidence is keyed *Misleading* or *Irrelevant*. Each costs 2 points.
- **Neutral:** relevant events that are not in the key timeline, steps without evidence, duplicates and unknown codes.
- The final (post-twist) timeline is scored. If it is empty, the initial one is used.

### Evidence support (6)

This is based on the report's *Key evidence* field: the final report's, or the initial report's if the final one is empty.

- **GOOD** = distinct cited items that are *Relevant* and were released **before** the twist.
- **BAD** = distinct cited items keyed *Misleading* or *Irrelevant*.
- Twist items are neutral. Citing only the twist earns nothing, and citing every item earns 0.

## Measured on the four real cases

These numbers come from `npm run test:scoring`.

| Strategy | A | B | C | D |
|---|---|---|---|---|
| Perfect, right before the twist | 50 | 50 | 50 | 50 |
| Perfect work, right only after the twist | 44 | 44 | 44 | 44 |
| Everything *Relevant* + 2 events + twist answer, citing only twist items | 12.3 | 13 | 13 | 13 |
| Trap kept to the end (red herrings believed) | 16.2 | 16.8 | 15.8 | 15.8 |
| Everything tagged *Relevant* (tagging only) | 0 | 0 | 0 | 0 |
| Random tags, average of 2,000 runs (out of 15) | 1.4 | 1.4 | 1.3 | 1.5 |
| Two correct timeline events (out of 15) | 4.3 | 5 | 5 | 5 |
| Half the key timeline in order (out of 15) | 8.6 | 7.5 | 7.5 | 7.5 |
| Every timestamped item sorted by time (out of 15) | 3 | 5 | 5 | 7 |
| Completely wrong / empty | 0 | 0 | 0 | 0 |

Under the previous rules, the shallow strategy in row 3 scored about 41/50.

## Judges 50 (unchanged)

| Criterion | Max | Rule |
|---|---|---|
| Responsible party identified | 10 | Judge score 0–10 × 1 |
| Logical reasoning | 15 | Judge score 0–10 × 1.5 |
| Evidence-based conclusion | 10 | Judge score 0–10 × 1 |
| Final report & presentation | 15 | Judge score 0–10 × 1.5, shortlisted teams only |

How the judge part is computed:

- Each criterion is averaged over the judges who entered it.
- Teams not assigned to any judge get 0 for the judge part.
- Judges see and score assigned teams only, only from *Closed*, and can no longer change scores after *Reveal results*.

## Final total and ties

- **Final total** = auto (0–50) + judges (0–50).
- **Ties** are broken by the earlier final submission. Auto-locked reports rank after submitted ones. If still tied, the team code decides.
- The shortlist is taken from the totals at the moment an organiser creates it. It asks for confirmation while judging is still incomplete.
