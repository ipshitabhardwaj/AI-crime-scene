/**
 * Reset the event from the terminal (same as Control room → More options →
 * Danger zone → Reset event):
 *
 *   npm run reset -- RESET
 *
 * Deletes every team's answers, reports, scores, judge assignments, the
 * shortlist and all extra time, and puts the event back to Waiting.
 * Keeps teams, PINs, check-ins, cases and the judge/admin accounts.
 * The word RESET is required so it cannot be run by accident.
 */
import { createClient } from "@supabase/supabase-js";
import { resetEventData } from "../lib/reset";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");

async function main() {
  const db = createClient(url!, serviceKey!, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: before } = await db.from("event").select("phase").eq("id", 1).single();

  if (process.argv[2] !== "RESET") {
    console.log(`The event is in phase "${before?.phase}". Nothing was changed.`);
    console.log("To reset it to Waiting and delete all answers, reports and scores, run:\n\n  npm run reset -- RESET\n");
    process.exit(1);
  }

  await resetEventData(db);
  const [{ data: after }, { count: answers }, { count: reports }, { count: teams }] = await Promise.all([
    db.from("event").select("phase").eq("id", 1).single(),
    db.from("evidence_tags").select("team_id", { count: "exact", head: true }),
    db.from("submissions").select("team_id", { count: "exact", head: true }),
    db.from("teams").select("id", { count: "exact", head: true }),
  ]);
  console.log(`Event reset: "${before?.phase}" → "${after?.phase}". Answers left: ${answers ?? 0}, reports left: ${reports ?? 0}. Teams kept: ${teams ?? 0}.`);
  console.log("Next: load the cases with `npm run seed` (or upload them on the Cases page), then start from the Control room.");
}

main().catch((e) => {
  console.error("Reset failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
