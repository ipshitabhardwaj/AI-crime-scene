"use client";

import { useActionState, useState } from "react";
import { loginStaff, loginTeam, type LoginState } from "@/app/actions/auth";

const initial: LoginState = { error: null };

const input =
  "w-full rounded-md border border-line bg-ink px-3 py-2.5 text-text placeholder:text-muted/60 focus:border-accent focus:outline-none";

export default function LoginForm() {
  const [tab, setTab] = useState<"team" | "staff">("team");
  // Controlled so a failed attempt doesn't clear them (React resets forms after an action).
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [teamState, teamAction, teamPending] = useActionState(loginTeam, initial);
  const [staffState, staffAction, staffPending] = useActionState(loginStaff, initial);

  return (
    <div className="rounded-2xl border border-line bg-panel p-6 shadow-2xl shadow-black/40">
      <h2 className="mb-4 text-lg font-semibold">Sign in</h2>
      <div className="mb-6 grid grid-cols-2 gap-1 rounded-lg bg-ink p-1 text-sm">
        {(["team", "staff"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-md py-2 font-medium ${tab === t ? "bg-panel text-text" : "text-muted hover:text-text"}`}
          >
            {t === "team" ? "Team" : "Organisers"}
          </button>
        ))}
      </div>

      {tab === "team" ? (
        <form action={teamAction} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Team code</span>
            <input name="code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="AIF-001" autoComplete="username" className={`${input} font-mono uppercase`} required />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">PIN</span>
            <input name="pin" type="password" inputMode="numeric" placeholder="6 digits" autoComplete="current-password" className={`${input} font-mono`} required />
          </label>
          {teamState.error && <p role="alert" className="rounded-md border border-danger/50 bg-danger/10 p-2 text-sm text-danger">{teamState.error}</p>}
          <button disabled={teamPending} className="w-full rounded-md bg-accent py-2.5 font-semibold text-ink disabled:opacity-60">
            {teamPending ? "Checking…" : "Open case file"}
          </button>
          <p className="text-xs text-muted">Your team code and PIN are on the slip from the registration desk. Every teammate uses the same code and PIN.</p>
        </form>
      ) : (
        <form action={staffAction} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Email</span>
            <input name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" className={input} required />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Password</span>
            <input name="password" type="password" autoComplete="current-password" className={input} required />
          </label>
          {staffState.error && <p role="alert" className="rounded-md border border-danger/50 bg-danger/10 p-2 text-sm text-danger">{staffState.error}</p>}
          <button disabled={staffPending} className="w-full rounded-md bg-accent py-2.5 font-semibold text-ink disabled:opacity-60">
            {staffPending ? "Checking…" : "Log in"}
          </button>
        </form>
      )}
    </div>
  );
}
