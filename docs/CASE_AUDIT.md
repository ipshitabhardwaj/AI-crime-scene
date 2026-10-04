# Case audit

The four event cases come from the organisers' "Crime Scene: The Unsolved Case" investigation files, adapted to this platform's format (short story → 8 one-clue multiple-choice questions → Initial Conclusion → twist with 3 more questions → Final Report). Re-run the checks with `npm run validate:cases` and `npm run audit:cases`.

| Case | Title | Story points to | Really did it |
|---|---|---|---|
| A | The Locked Room | Daniel, the heir | Sarah Menon, the business partner |
| B | The Leaked Question Paper | Rohan, the teaching assistant | Gopal Bhatia, the clerk |
| C | The Museum Heist | Joseph, the night guard | Rekha Bhandari, the jewellery designer |
| D | The Missing Person | Dev, the ex | Kavya Nair, the understudy |

## What was changed from the source files

- **Format.** The source used scene hotspots, mixed question types (multi-select, short answer, timeline ordering), a 40-point reconstruction rubric, hints and a time bonus. This platform has none of those, so every graded point became a four-option question with one clue, and the reconstruction became the short report that judges read. Hints, hotspots and the time bonus are not used.
- **Twist.** The source showed all evidence at once. Here the most decisive items are held back for the twist: A: gate log, spare key, diary. B: visitor register and tiffin, the drawer notice, whose mug it is. C: the curator's and Mr. Anil's statements. D: Kavya's 9:08 message, the missing B-07 key and new padlock, her script.
- **Case A, cinema ticket.** The source had the film ending at 11:50 PM but the gate log showing Daniel coming home at 11:15 PM. The film now ends at 11:00 PM so the two agree.
- **Case A, sugar.** The source's hint asks "who takes sugar?" but no evidence said. Meera's statement now adds: "Sir drinks his black. Sarah madam always takes sugar."
- **Case A, shoe print.** The muddy size-7 print (a red herring with no explanation in the source) is left out.
- **Case C, cleaner's log.** "Necklace sparkling nicely" did not prove the real necklace was there, so the log now adds "The little lion is shining."
- **Case C, night.** A line was added that the case's lock sensor shows it was not opened that night, so the camera gap can be ruled out from evidence.
- **Case D, notebook.** Added that Ananya writes "definitely" correctly, twice, so the spelling comparison is checkable.
- **Case D, director.** Added his line that losing Ananya hurts his own show, to give a reason beyond leaving at 9:15.

## What was checked

- Same amount of work in every case: 8 questions + 3 twist questions, 3 suspects, a story of 120–155 words.
- Each question can be answered from its own clue.
- Correct answers are spread over A–D (2–3 each), and the correct option is not the longest more often than chance would explain (ties in length are counted as "longest" by the audit).
- Every wrong suspect is cleared by at least one clue.

## Known limits

- Case A involves a death. It is described without detail, but tell the faculty in charge if that matters for your event.
- The cases are easy by design; ranking will lean on the Initial Conclusion points, the judges and submission time.

## Difficulty raised (4 Oct 2026)

At the organisers' request the questions were made harder. Stories, suspects, culprits, pictures, the number of questions (8 + 3) and the scoring are unchanged.

- Questions now ask teams to combine facts, weigh a clue ("a hint, not proof") or reject a tempting wrong reading, instead of repeating what the clue says.
- Wrong options are plausible partial readings of the same clue.
- Round-1 questions no longer have the culprit's name as the answer (Locked Room Q6, Missing Person Q7).
- Small facts were added so every question has one defensible answer: the doctor's note and the cinema car-park stamps (Locked Room); the unlocked drawer, the 8:01 PM forward and the corridor guard (Leaked Paper); the lock-sensor hours and "weeks to make" (Museum Heist); "last seen at 9:05 PM" and Friday's rehearsal (Missing Person).
- `npm run audit:cases` reports no warnings: correct answers are spread over A–D and the correct option is the longest in at most 3 of 11 questions per case.
