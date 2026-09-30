# The AI Files — case solutions (ORGANISERS ONLY)

Do not share this file or the `cases/` folder with participants. The same answer keys are visible to admins and judges inside the app (Cases → Preview + answer key, and on each judge page).

All four cases share one root-cause list, so the dropdown never hints at the answer. Each case has a "trap": the obvious conclusion before the twist. Careful teams can find the real answer **before** the twist from clues already on the board; the twist confirms it for everyone else. Automatic scoring (docs/SCORING.md) gives 6 points for already having the real category in the initial hypothesis, 8 for the final category, and 6 for citing pre-twist evidence that proves it — so the twist confirms the answer but copying it earns little.

Definitions of the 10 categories are shown to teams next to the dropdown (lib/root-causes.ts). The key's timeline counts only the incident chain: relevant events outside it are neutral, misleading/irrelevant events in a timeline cost 2 points each.

| Case | Theme | Trap (before twist) | Real root cause (scored) |
| --- | --- | --- | --- |
| A | The 2:17 AM Incident | Compromised credentials / external attacker | Human error during an approved change |
| B | The AI That Lied | AI model or prompt error | Bad or wrongly formatted input data |
| C | The Vanishing Data | Deliberate insider action | Buggy code release |
| D | The Fake Signal | Hardware failure | Test or staging activity hitting production |

All evidence is written in plain language (activity records, chats, emails, tables, documents, AI outputs): no code or technical logs, so non-CS teams can play. Each case has 17–18 evidence items, a third or more of them misleading or irrelevant, and 1–2 twist items (T01, T02). Sized for a 60–75 minute investigation with 2–4 people. `npm run validate:cases` checks all of this automatically.

**Tag rule shown to teams** (so the key is predictable): *Relevant* = part of what actually happened, or needed to prove it, even if it looked suspicious at first. *Misleading* = points toward a wrong explanation and is not part of the real cause. *Irrelevant* = unrelated noise. Items on the boundary between misleading and irrelevant cost at most ~0.8 of 50 points.

---

## CASE-A · The 2:17 AM Incident (Finvera Payments)

**What really happened.** On-call engineer Karthik, working from home on a replacement laptop, carried out approved change CHG-4471: a nightly "we miss you" SMS reminder. He gave the reminder program permission to read customer details, scheduled it for 02:17 on the message server, and planned to add the NOTIFY_TEMPLATE setting "in the morning", not realising 02:17 was that same night. The program ran without the setting, fell back to its default "account suspended" message and started texting 48,210 inactive customers in batches of 1,000. After ~25,000 SMS the SMS company's hourly limit was hit; the program retried endlessly, its record file filled the disk and the server shut down.

**Correct timeline**
1. E01 23:42 Karthik signs in from the new laptop (he approved the phone confirmation)
2. E04 00:03 gives the reminder program permission, reason "CHG-4471"
3. E05 00:05 schedules the reminder job for 02:17
4. E07 02:17 program looks up 48,210 inactive customers
5. E09 02:23 SMS company accepts batch 1 with the "account suspended" message
6. E10 02:26:13 SMS company refuses batch 26 (hourly limit of 25,000 reached)
7. E11 02:26–02:31 endless retries fill the disk, server shuts down

**Trap:** new laptop + new city (E01), permission given (E04), a job scheduled at night (E05), mass lookup (E07), password-guessing attempts (E06), a bot scan on the firewall (E12), panicked support chat (E02), and an AI summary saying "account takeover" (E13).

**Clues available before the twist:** LT-7F2 is an IT-issued replacement laptop (E03); Karthik approved the phone confirmation (E01); the permission cites a change number and he is on call (E04); the reminder program's instruction sheet says it defaults to the "account suspended" message if NOTIFY_TEMPLATE is missing (E08); the settings file has no NOTIFY_TEMPLATE (E14); the password guessing was blocked and never succeeded (E06).

**Misleading:** E02, E06, E12, E13. **Irrelevant:** E15 datacentre report, E16 certificate renewal.

**Good fixes:** no dangerous defaults (refuse to run if the message setting is missing); test run first; checklist done before scheduling; limit retries; keep record files from filling the disk; approve SMS text before bulk sends.

---

## CASE-B · The AI That Lied (Kiranaa Mart)

**What really happened.** A billing-machine update (5.2) installed itself at the nine North trial stores on Sunday 23:00 and switched their sales files to the European number style `91.732,50` (dot for thousands, comma for decimals). The nightly upload removes every comma, so ₹91,732.50 became ₹91.7325: every amount about 1/1000th of reality. A warning fired but nobody watched it. InsightBot faithfully reported the numbers it was given.

**Correct timeline**
1. T01 Sun 23:00 billing update 5.2 installs at the 9 North stores (twist item)
2. E08 Mon 01:00 store sales files arrive in the new number style
3. E07 Mon 02:00 nightly upload reads them; warning about 9 North stores ignored
4. E09 Mon 06:00:00 InsightBot is given the tiny North totals
5. E01 Mon 06:00:12 report says North collapsed, recommends closures
6. E10 Mon 09:10 CEO forwards it to the board

**Trap:** AI upgraded on Friday (E02), "be decisive" instruction added (E03), analysts blaming the AI for making things up (E04), heavy rain in North (E13), a competitor opening nearby (E16).

**Clues available before the twist:** going back to the old AI version and old instructions gave the same numbers (E04); the data given to InsightBot already contains the tiny totals (E09); the AI only copies the totals it is given (E11); an average bill of ₹0.11 (E05); the store file uses commas for decimals (E08); the upload removes every comma (E06); the upload warning names exactly those 9 stores (E07); the store manager says "the billing machines updated themselves on Sunday night" (E12).

**Misleading:** E02, E03, E13, E16. **Irrelevant:** E14 newsletter, E15 salary record, E17 AC repair. (E04 is tagged relevant: it contains the decisive fact that going back changed nothing.)

**Good fixes:** read numbers in the store's own format or reject unclear ones; block uploads with impossible values (₹0.11 bills); never ignore data warnings; check vendor updates; have the AI point out strange drops (−99% in 9 stores) instead of recommending closures.

---

## CASE-C · The Vanishing Data (ShopSphere)

**What really happened.** Archiving program version 2.0 (change #812), put live on Tuesday 18:20, renamed its setting RETENTION_DAYS to ARCHIVER_RETENTION_DAYS and made "missing" mean keep 0 days instead of 30. The live settings file still used the old name, so at 03:00 the program kept 0 days: it copied **every** order to long-term storage and removed them from the live system. The departing database manager only looked at and copied data for her handover, with a read-only account. The orders are safe in storage.

**Correct timeline**
1. E06 Tue 18:20 archiving program v2.0 put live
2. E09 Wed 03:00:00 nightly run starts with "days to keep: 0"
3. E12 03:00:03 3,412 orders saved to long-term storage
4. E02 03:00:04 3,412 orders deleted from the live system
5. E10 07:15 customers' app shows "no orders"
6. E11 07:30 support flooded

**Trap:** Neha resigned unhappily (E04), asked people not to touch the live system (E05), copied the orders to her laptop at 23:52 (E03), and an AI names her as the suspect (E13).

**Clues available before the twist:** the delete was done by the archiving program, not Neha (E02); "days of orders to keep: 0" in the program's activity (E09); the new version reads ARCHIVER_RETENTION_DAYS (0 if missing) while the settings file has RETENTION_DAYS (E07, E08); Neha's account cannot delete orders (E16); the orders are in storage (E12).

**Misleading:** E03, E04, E05, E13. **Irrelevant:** E14 website photos refresh, E15 cafeteria email.

**Good fixes:** restore from storage; refuse to run when a setting is missing instead of deleting everything; check settings before going live; a safety limit ("never delete more than X% at once"); treat renamed settings as a risky change.

---

## CASE-D · The Fake Signal (Campus Nexus)

**What really happened.** The QA team moved its nightly test to a new testing system the evening before. The BROKER_URL setting was not copied, and the replay tool then sends messages to the **live** campus hub. At 03:11 it played back the recording of the 14 August fire drill into the live system. The live hub accepted a device without a password and the fire rule needed only one sensor, so a replayed smoke reading of 812 from C3-SMK-114 triggered a real evacuation. The sensor itself is fine.

**Correct timeline**
1. T01 03:11:40 QA test run starts, BROKER_URL empty (twist item)
2. E05 03:11:59 device "nx-sim-02" (the replay tool, from address 10.20.4.77) connects to the live hub without a password
3. E03 03:12:03 replayed alarm message (dated 14 Aug, old message number) arrives
4. E01 03:12:04 fire alert from a single sensor
5. E08 03:12:06 sirens, evacuation
6. E09 03:25 fire team: nothing found, sensor works normally

**Trap:** maintenance tickets for the sensor (E02), wardens blaming it (E06), AI diagnosis "sensor broken" (E07), plus noise in the same minute (E15: water tank, door card).

**Clues available before the twist:** the alarm message is dated 14 August and its message number goes backwards (E03, E04); the sender "nx-sim-02" is the replay tool's name (E11) and connects from 10.20.4.77, which is the QA team's test computer (E04, E05, E12); the drill recording was given to QA (E10); the tool uses the live hub when BROKER_URL is empty (E11); the fire team found the sensor working (E09).

**Misleading:** E02, E06, E07, E15. **Irrelevant:** E13 power dip (different block), E14 mess timings.

**Good fixes:** test tools should never default to the live system; require a password on the live hub; keep test computers away from building systems; reject old-dated or out-of-order messages; require two sensors before evacuating.
