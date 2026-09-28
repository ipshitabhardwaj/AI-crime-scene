# The AI Files — case solutions (ORGANISERS ONLY)

Do not share this file or the `cases/` folder with participants. The same answer keys are visible to admins and judges inside the app (Cases → Preview + answer key, and on each judge page).

All four cases share one root-cause list, so the dropdown never hints at the answer. Each case has a "trap": the obvious conclusion before the twist. Careful teams can find the real answer **before** the twist from clues already on the board; the twist confirms it for everyone else. Scoring rewards the post-twist answer and the change (Adaptability).

| Case | Theme | Trap (before twist) | Real root cause (scored) |
| --- | --- | --- | --- |
| A | The 2:17 AM Incident | Compromised credentials / external attacker | Human error during an approved change |
| B | The AI That Lied | AI model or prompt error | Bad or wrongly formatted input data |
| C | The Vanishing Data | Deliberate insider action | Buggy code release |
| D | The Fake Signal | Hardware failure | Test or staging activity hitting production |

Each case has 17–18 evidence items, a third or more of them misleading or irrelevant, and 1–2 twist items (T01, T02). Sized for a 60–75 minute investigation with 2–4 people. `npm run validate:cases` checks all of this automatically.

**Tag rule shown to teams** (so the key is predictable): *Relevant* = part of what actually happened, or needed to prove it, even if it looked suspicious at first. *Misleading* = points toward a wrong explanation and is not part of the real cause. *Irrelevant* = unrelated noise. Items on the boundary between misleading and irrelevant cost at most ~0.8 of 50 points.

---

## CASE-A · The 2:17 AM Incident (Finvera Payments)

**What really happened.** On-call engineer Karthik, working from home on a replacement laptop, carried out approved change CHG-4471: a nightly "we miss you" SMS job. He granted the job's service account read access, added the cron entry for 02:17 on prod-app-02, and planned to set `NOTIFY_TEMPLATE` "in the morning", not realising 02:17 was that same night. The job ran without the setting, fell back to its default `ACCOUNT_SUSPENDED` template and started texting 48,210 dormant customers in chunks of 1,000. After 25 chunks (~25,000 SMS) the gateway's hourly quota was hit; the job retried forever, the log filled the disk and the server died.

**Correct timeline**
1. E01 23:42 Karthik logs in via VPN from the new laptop (MFA approved)
2. E04 00:03 grants `customers:read_all` to svc_notify, reason "CHG-4471"
3. E05 00:05 adds the cron entry for 02:17
4. E07 02:17 job reads 48,210 dormant customers
5. E09 02:23 gateway accepts the first chunk with template ACCOUNT_SUSPENDED
6. E10 02:26:13 gateway returns 429 (hourly quota of 25,000 reached)
7. E11 02:26:14–02:31 retry loop fills /var/log, server shuts down

**Trap:** new device + new city (E01), privilege grant (E04), "persistence" via cron (E05), bulk read (E07), a brute-force attempt (E06), a bot scan on the WAF (E12), panicked support chat (E02), and an AI summary saying "account takeover" (E13).

**Clues available before the twist:** LT-7F2 is an IT-issued replacement laptop (E03); MFA was approved (E01); the grant cites a change number (E04); `reengage.py` defaults to ACCOUNT_SUSPENDED (E08); the `.env` has no NOTIFY_TEMPLATE (E14); the brute-force was banned and never succeeded (E06).

**Misleading:** E02, E06, E12, E13. **Irrelevant:** E15 datacentre report, E16 certificate renewal.

**Good fixes:** no dangerous defaults (fail if NOTIFY_TEMPLATE is missing); dry-run first; change checklist verified before scheduling; cap retries with backoff; separate log volume and log rotation by size; SMS content approval for bulk sends.

---

## CASE-B · The AI That Lied (Kiranaa Mart)

**What really happened.** The POS vendor's update 5.2 switched the nine North pilot stores' CSV exports to the `1.234,56` number format on Sunday 23:00. The ETL parser strips commas, so `91.732,50` became `91.7325`: every amount about 1/1000th of reality. A data-quality alert fired but its channel was muted. InsightBot faithfully reported the numbers it was given.

**Correct timeline**
1. T01 Sun 23:00 POS 5.2 auto-installs on the 9 North stores (twist item)
2. E08 Mon 01:00 exports use the new format
3. E07 Mon 02:00 ETL loads them; quality alert fires into a muted channel
4. E09 Mon 06:00:00 InsightBot receives the tiny North totals
5. E01 Mon 06:00:12 report says North −61%, recommends closures
6. E10 Mon 09:10 CEO forwards to the board

**Trap:** model upgraded on Friday (E02), "be decisive" prompt change (E03), analysts blaming hallucination (E04), heavy rain in North (E13), a competitor opening nearby (E16).

**Clues available before the twist:** rolling back model and prompt gave the same numbers (E04); the request already contains the tiny totals (E09); the model only repeats totals (E11); average bill of ₹0.11 (E05); raw CSV uses comma decimals (E08); parser strips commas (E06); the ETL warning about exactly those 9 stores (E07); the store manager says "the billing machines updated themselves on Sunday night" (E12).

**Misleading:** E02, E03, E13, E16. **Irrelevant:** E14 newsletter, E15 payroll log, E17 AC repair. (E04 is tagged relevant: it contains the decisive fact that rolling back changed nothing.)

**Good fixes:** parse with an explicit locale or reject ambiguous formats; schema/range validation that blocks the load; never mute data-quality alerts; pin POS export settings and review vendor release notes; have the AI flag anomalies ("−99% in 9 stores") instead of recommending closures.

---

## CASE-C · The Vanishing Data (ShopSphere)

**What really happened.** Release archiver v2.0.0 (PR #812), deployed Tuesday 18:20, renamed the setting `RETENTION_DAYS` to `ARCHIVER_RETENTION_DAYS` and changed its default from 30 to 0. Production still set the old name, so at 03:00 the archiver used 0 days: it copied **every** order to S3 and deleted them from the live table. The departing DBA only ran read-only queries for her handover. The data is safe in the S3 archive.

**Correct timeline**
1. E06 Tue 18:20 archiver v2.0.0 deployed
2. E09 Wed 03:00:00 scheduled run starts with retention_days=0
3. E12 03:00:03 3,412 rows uploaded to the S3 archive
4. E02 03:00:04 DELETE … interval '0 days', 3,412 rows
5. E10 07:15 customers' app shows "no orders"
6. E11 07:30 support flooded

**Trap:** DBA Neha resigned unhappily (E04), asked people not to touch prod (E05), exported 30 days of orders at 23:52 (E03), and an AI names her as the suspect (E13).

**Clues available before the twist:** the delete was run by `svc_archiver`, not Neha (E02); `retention_days=0` in the archiver log (E09); the new config reads `ARCHIVER_RETENTION_DAYS` with default 0 while production sets `RETENTION_DAYS` (E07, E08); Neha's role cannot delete (E16); the rows are in S3 (E12).

**Misleading:** E03, E04, E05, E13. **Irrelevant:** E14 CDN image purge, E15 cafeteria email.

**Good fixes:** restore from the S3 archive; fail on missing config instead of a destructive default; config validation in CI/deploy; a safety limit ("refuse to delete more than X% of rows"); soft-delete; review renames of settings as breaking changes.

---

## CASE-D · The Fake Signal (Campus Nexus)

**What really happened.** QA moved its nightly load test to a new CI platform the evening before. The `BROKER_URL` secret was not copied, and the replay tool falls back to the **production** broker. At 03:11 it replayed the 14 August fire-drill recording into production. The production broker accepted anonymous publishes and the fire rule needed only one sensor, so a replayed 812 ppm reading from C3-SMK-114 triggered a real evacuation. The sensor itself is fine.

**Correct timeline**
1. T01 03:11:40 CI job starts, BROKER_URL empty (twist item)
2. E05 03:11:59 client nx-sim-02 (the replay tool, from CI runner 10.20.4.77) connects anonymously to the prod broker
3. E03 03:12:03 replayed message (ts 14 Aug, seq 55120) published
4. E01 03:12:04 fire alert from single sensor
5. E08 03:12:06 sirens, evacuation
6. E09 03:25 fire team: nothing found, sensor tests normal

**Trap:** maintenance tickets for the sensor (E02), wardens blaming it (E06), AI diagnosis "hardware malfunction" (E07), plus noise in the same minute (E15: water tank, door card).

**Clues available before the twist:** message timestamp is 14 August and the sequence number goes backwards (E03, E04); sender `nx-sim-02` is the client id in the replay tool's config (E11) and connects from 10.20.4.77, which is the QA CI runner (E04, E05, E12); the drill recording was given to QA (E10); the tool defaults to the prod broker (E11); fire team found the sensor working (E09).

**Misleading:** E02, E06, E07, E15. **Irrelevant:** E13 grid voltage dip (different block), E14 mess timings.

**Good fixes:** never default tools to production; separate credentials per environment and no anonymous publishing on the production broker; network isolation between CI and building systems; reject stale timestamps / out-of-order sequence numbers; require two sensors before evacuation.
