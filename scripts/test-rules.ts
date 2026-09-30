/**
 * Event-rule tests (no database):  npm run test:rules
 *  - phase state machine (allowed/forbidden transitions, guards)
 *  - extra-time rule (phase-only vs whole-event)
 *  - login capacity calculation
 *  - root-cause definitions cover every case option
 * Database-side rules (who may write/read what, when) are tested by
 * supabase/tests/security_checks.sql.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { capacitySettings, planAuthCapacity } from "../lib/capacity";
import { PHASES, type EventPhase } from "../lib/constants";
import { effectiveExtraMinutes, teamDeadline } from "../lib/phase";
import { ROOT_CAUSE_HELP } from "../lib/root-causes";
import { TRANSITIONS, checkTransition, findTransition } from "../lib/state-machine";

let passed = 0;
const test = (name: string, fn: () => void) => {
  fn();
  passed++;
  if (process.env.VERBOSE) console.log("  ✓", name);
};

const facts = { teamsWithoutCase: 0, autoScores: 10, shortlist: 5 };
const go = (from: EventPhase, to: EventPhase, o: Partial<{ confirmed: boolean; backWord: string }> = {}, f = facts) =>
  checkTransition(from, to, { confirmed: false, backWord: "", ...o }, f);

// ------------------------------------------------------------ state machine
test("happy path works step by step with the required confirmations", () => {
  assert.equal(go("waiting", "investigation").ok, true);
  assert.equal(go("investigation", "initial_locked").ok, false);
  assert.equal(go("investigation", "initial_locked", { confirmed: true }).ok, true);
  assert.equal(go("initial_locked", "twist", { confirmed: true }).ok, true);
  assert.equal(go("twist", "final").ok, true);
  assert.equal(go("final", "closed", { confirmed: true }).ok, true);
  assert.equal(go("closed", "presentations").ok, true);
  assert.equal(go("presentations", "results", { confirmed: true }).ok, true);
});

test("skipping steps is impossible except Twist → Closed and Closed → Results", () => {
  for (const [a, b] of [
    ["waiting", "initial_locked"], ["waiting", "twist"], ["waiting", "closed"], ["waiting", "results"],
    ["investigation", "twist"], ["investigation", "closed"], ["initial_locked", "final"], ["initial_locked", "closed"],
    ["final", "presentations"], ["twist", "results"],
  ] as [EventPhase, EventPhase][]) {
    const r = go(a, b, { confirmed: true, backWord: "BACK" });
    assert.equal(r.ok, false, `${a} → ${b} should be refused`);
    if (!r.ok) assert.equal(r.reason, "invalid");
  }
  assert.equal(go("twist", "closed", { confirmed: true }).ok, true);
  assert.equal(go("closed", "results", { confirmed: true }).ok, true);
});

test("going back: only one step, only with the word BACK", () => {
  const r1 = go("twist", "initial_locked");
  assert.equal(r1.ok, false);
  if (!r1.ok) assert.equal(r1.reason, "needs-back");
  assert.equal(go("twist", "initial_locked", { backWord: " back " }).ok, true);
  const r2 = go("closed", "investigation", { backWord: "BACK" });
  assert.equal(r2.ok, false);
  if (!r2.ok) assert.equal(r2.reason, "invalid");
});

test("guards: no case → needs tick; presentations need a shortlist; results need auto-scores", () => {
  const f0 = { teamsWithoutCase: 3, autoScores: 0, shortlist: 0 };
  const r = go("waiting", "investigation", {}, f0);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "teams-without-case");
  assert.equal(go("waiting", "investigation", { confirmed: true }, f0).ok, true);
  const p = go("closed", "presentations", {}, f0);
  assert.equal(p.ok, false);
  if (!p.ok) assert.equal(p.reason, "no-shortlist");
  const q = go("closed", "results", { confirmed: true }, f0);
  assert.equal(q.ok, false);
  if (!q.ok) assert.equal(q.reason, "no-scores");
  const same = go("twist", "twist");
  assert.equal(same.ok, false);
  if (!same.ok) assert.equal(same.reason, "already");
});

test("every phase is reachable and every phase except Waiting has a way back", () => {
  for (const p of PHASES.map((x) => x.id)) {
    if (p !== "waiting") assert.ok(TRANSITIONS.some((t) => t.to === p && !t.back), `${p} unreachable`);
    if (p !== "waiting") assert.ok(TRANSITIONS.some((t) => t.from === p && t.back), `${p} has no way back`);
  }
  assert.equal(findTransition("results", "waiting"), null);
});

// ----------------------------------------------------------------- extra time
test("extra time: phase extension applies only in its own phase; whole-event always", () => {
  const team = { extra_minutes: 5, phase_extra_minutes: 10, phase_extra_phase: "investigation" as EventPhase };
  assert.equal(effectiveExtraMinutes(team, "investigation"), 15);
  assert.equal(effectiveExtraMinutes(team, "twist"), 5);
  assert.equal(effectiveExtraMinutes(team, "final"), 5);
  assert.equal(effectiveExtraMinutes({ extra_minutes: 0, phase_extra_minutes: 10, phase_extra_phase: null }, "twist"), 0);
  assert.equal(effectiveExtraMinutes(null, "twist"), 0);
  const end = "2026-10-10T10:00:00.000Z";
  assert.equal(teamDeadline(end, effectiveExtraMinutes(team, "twist")), new Date(end).getTime() + 5 * 60_000);
  assert.equal(teamDeadline(null, 30), null);
});

// ------------------------------------------------------------------ capacity
test("login capacity: documented table values", () => {
  // everyone at once (5-minute window), ×1.15 failures, ×2 safety
  assert.equal(planAuthCapacity({ teams: 70, devicesPerTeam: 1, loginWindowMinutes: 5 }).recommendedPer5Min, 161);
  assert.equal(planAuthCapacity({ teams: 70, devicesPerTeam: 2, loginWindowMinutes: 5 }).recommendedPer5Min, 322);
  assert.equal(planAuthCapacity({ teams: 70, devicesPerTeam: 3, loginWindowMinutes: 5 }).recommendedPer5Min, 483);
  assert.equal(planAuthCapacity({ teams: 70, devicesPerTeam: 4, loginWindowMinutes: 5 }).recommendedPer5Min, 644);
  // staggered over 30 minutes: peak ≈ devices ÷ 3
  assert.equal(planAuthCapacity({ teams: 70, devicesPerTeam: 4, loginWindowMinutes: 30 }).recommendedPer5Min, 215);
  assert.equal(planAuthCapacity({ teams: 0, devicesPerTeam: 3, loginWindowMinutes: 5 }).recommendedPer5Min, 0);
});

test("capacity settings: defaults and overrides from env", () => {
  assert.deepEqual(capacitySettings({}), { devicesPerTeam: 3, loginWindowMinutes: 5, configuredLimitPer5Min: 0 });
  assert.deepEqual(
    capacitySettings({ EVENT_DEVICES_PER_TEAM: "2", EVENT_LOGIN_WINDOW_MINUTES: "30", SUPABASE_AUTH_TOKEN_LIMIT_PER_5MIN: "600" }),
    { devicesPerTeam: 2, loginWindowMinutes: 30, configuredLimitPer5Min: 600 },
  );
  assert.equal(capacitySettings({ EVENT_DEVICES_PER_TEAM: "abc" }).devicesPerTeam, 3);
});

// ---------------------------------------------------------------- root causes
test("every root-cause option in every case has a definition", () => {
  const dir = join(process.cwd(), "cases");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    const c = JSON.parse(readFileSync(join(dir, f), "utf8")) as { root_cause_options: string[] };
    for (const o of c.root_cause_options) assert.ok(ROOT_CAUSE_HELP[o], `${f}: no definition for “${o}”`);
  }
});

console.log(`rule tests passed (${passed} tests)`);
