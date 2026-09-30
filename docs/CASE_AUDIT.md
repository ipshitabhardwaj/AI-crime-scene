# Case audit (organisers only — contains answers)

This audit uses the automatic metrics from `npm run audit:cases` plus a human read-through of every evidence item. The only content change was one time label (CASE-D E01).

| Check | A · 2:17 AM | B · AI That Lied | C · Vanishing Data | D · Fake Signal |
|---|---|---|---|---|
| Evidence (twist) | 18 (2) | 18 (1) | 18 (2) | 17 (2) |
| Relevant / misleading / irrelevant | 12 / 4 / 2 | 11 / 4 / 3 | 12 / 4 / 2 | 11 / 4 / 2 |
| Noise ratio | 33% | 39% | 33% | 35% |
| Time labels / key timeline in time order | 15 of 18 / ✓ | 13 of 18 / ✓ | 12 of 18 / ✓ | 12 of 17 / **✗ → fixed** |
| Source labels (every item names its system, channel or sender) | ✓ | ✓ | ✓ | ✓ |
| Misleading clues support the trap | E02, E06, E12, E13 | E02, E03, E13, E16 | E03, E04, E05, E13 | E02, E06, E07, E15 |
| Answer leakage before the twist | none | none | none | "load test" in E10 and E11 (intended clues) |
| Root cause inferable before the twist | yes: E03 + E04 + E08 + E14 | yes: E04 + E06 + E08 + E09 + E12 | yes: E02/E09 + E07 + E08 + E16 | yes: E03 + E04 + E05 + E10 + E11 + E12 |
| Pre-twist relevant items to cite (4 needed) | 10 | 10 | 10 | 9 |
| Twist confirms or gives away? | Gives it away (T01 prerequisites, T02 "02:17 was tonight") | Nearly (T01 format change) | Gives it away (T01 diff) | Gives it away (T02 "falls back to prod") |
| Solvable from ONE giveaway clue before the twist? | No (needs 3–4 items) | No | No | No |

## Fixed

- **CASE-D E01 time label** changed from `03:12` to `03:12:04` (the log line itself says 03:12:04). Labels sort as text, so `03:12` came before E03's `03:12:03`. A team ordering its timeline by the labels would have placed E01 and E03 the wrong way round and lost ordering points.
- **Ambiguous root-cause categories.** Teams now see a one-line definition of every category and the rule "choose the most specific category that describes the direct cause" (`lib/root-causes.ts`). These definitions separate the pairs that caused the most doubt:
  - A: "human error during an approved change" vs "buggy code".
  - B: "bad input data" vs "third-party" vs "buggy code".
  - C: "buggy code release" vs "human error".
  - D: "test/staging hitting production" vs "human error".
  - ASSUMPTION — can be changed later: the wording of the definitions.
- **Relevant timestamped events outside the key timeline** (A T01/T02, B E04/E12, C T02, D E10/T02) are now **neutral** in timeline scoring instead of costing points. This is a scoring change, not a case change.

## Not changed (flagged for your team)

- **The twist states the answer in A, C and D.** I did not rewrite the twist items. Instead, the scoring now makes copying the twist worth little: no hypothesis points and no evidence-support points for twist-only citations. A correct hypothesis before the twist is worth 6 points, and citing pre-twist evidence is worth 6 more. A team that only copies the twist gets neither. If you want the twist to be only a hint, T02 in A and T02 in D are the lines to soften.
- **Same-session items tagged differently in C** (E03 excerpt = misleading, T02 full session = relevant). This is consistent with the tag rule, because the excerpt supports the wrong story and the full session disproves it. The cost is at most one tag.
- **D E15** ("other zones, same minute") is keyed *misleading*, but some teams will call it *irrelevant*. Under the new scoring that costs about 0.6 points.
- **The cross-case pattern:** the briefing pushes a wrong hypothesis and an AI summary is always misleading. Teams that compare cases can learn it. This is a physical-proctoring matter.
