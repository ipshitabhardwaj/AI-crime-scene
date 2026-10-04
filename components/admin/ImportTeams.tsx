"use client";

import Papa from "papaparse";
import Link from "next/link";
import { useMemo, useState } from "react";
import { importTeams, type ImportResult, type ImportRow } from "@/app/actions/admin-teams";
import { ui } from "@/lib/ui";

type Field = "code" | "pin" | "name" | "institution" | "email" | "phone" | "member1" | "member2" | "member3" | "member4";

const FIELDS: { id: Field; label: string; required?: boolean; guess: RegExp }[] = [
  { id: "code", label: "Team ID (optional — else AIF-001, 002…)", guess: /^team\s*(id|code)$/i },
  { id: "pin", label: "PIN, 6–20 letters/digits (optional — else random)", guess: /^pin$|^password$/i },
  { id: "name", label: "Team name", required: true, guess: /team\s*name|^team$/i },
  { id: "institution", label: "College / institution", guess: /college|institut|university|school/i },
  { id: "email", label: "Leader email", guess: /e-?mail/i },
  { id: "phone", label: "Leader phone", guess: /phone|mobile|contact\s*no|whatsapp/i },
  { id: "member1", label: "Member 1 (leader) name", guess: /(leader|member\s*1|participant\s*1).*name|^name$|full\s*name/i },
  { id: "member2", label: "Member 2 name", guess: /(member|participant)\s*2/i },
  { id: "member3", label: "Member 3 name", guess: /(member|participant)\s*3/i },
  { id: "member4", label: "Member 4 name", guess: /(member|participant)\s*4/i },
];

const CHUNK = 20;
const MAX_ROWS = 1000;
const MAX_BYTES = 2_000_000;

type Mapped = ImportRow & { members: string[]; line: number; issues: string[] };

export default function ImportTeams() {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [map, setMap] = useState<Partial<Record<Field, string>>>({});
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);

  const reset = () => {
    setResult(null);
    setError(null);
    setHeaders([]);
    setRows([]);
    setParseWarnings([]);
  };

  const onFile = (file: File) => {
    reset();
    if (file.size > MAX_BYTES) return setError("File is larger than 2 MB. Export only the response columns you need.");
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy", // also skips rows that are only commas
      transformHeader: (h) => h.trim(),
      complete: (res) => {
        const hs = (res.meta.fields ?? []).filter(Boolean);
        if (!hs.length) return setError("No header row found. The first line must contain column names.");
        if (res.data.length === 0) return setError("The file has no data rows (only a header). Check that you downloaded the responses sheet.");
        if (res.data.length > MAX_ROWS) return setError(`The file has ${res.data.length} rows; the limit is ${MAX_ROWS}.`);
        setParseWarnings(res.errors.slice(0, 10).map((e) => `Line ${(e.row ?? 0) + 2}: ${e.message}`));
        setHeaders(hs);
        setRows(res.data);
        const guessed: Partial<Record<Field, string>> = {};
        const used = new Set<string>();
        for (const f of FIELDS) {
          const h = hs.find((x) => !used.has(x) && f.guess.test(x));
          if (h) {
            guessed[f.id] = h;
            used.add(h);
          }
        }
        setMap(guessed);
      },
      error: (e) => setError(`Could not read the CSV: ${e.message}`),
    });
  };

  const mapped: Mapped[] = useMemo(() => {
    const seenName = new Map<string, number>();
    const seenEmail = new Map<string, number>();
    const out = rows.map((r, i) => {
      const get = (f: Field) => (map[f] ? String(r[map[f]!] ?? "").trim().replace(/\s+/g, " ") : "");
      const members = (["member1", "member2", "member3", "member4"] as const).map(get).filter(Boolean);
      const name = get("name");
      const email = get("email").toLowerCase();
      seenName.set(name.toLowerCase(), (seenName.get(name.toLowerCase()) ?? 0) + 1);
      if (email) seenEmail.set(email, (seenEmail.get(email) ?? 0) + 1);
      const issues: string[] = [];
      if (!name) issues.push("no team name → will be skipped");
      if (map.member1 && (members.length < 2 || members.length > 4)) issues.push(`${members.length} member(s)`);
      if (email && !/^\S+@\S+\.\S+$/.test(email)) issues.push("invalid email → will fail");
      const code = get("code").toUpperCase();
      const pin = get("pin").toUpperCase();
      if (code && !/^[A-Z0-9-]{3,20}$/.test(code)) issues.push("Team ID must be 3–20 letters, digits or dashes → will fail");
      if (pin && !/^[A-Z0-9]{6,20}$/.test(pin)) issues.push("PIN must be 6–20 letters or digits, no spaces → will fail");
      return { code, pin, name, institution: get("institution"), email, phone: get("phone"), members, source: r, line: i + 2, issues };
    });
    for (const m of out) {
      if (m.name && (seenName.get(m.name.toLowerCase()) ?? 0) > 1) m.issues.push("duplicate name in file (only the first is imported)");
      if (m.email && (seenEmail.get(m.email) ?? 0) > 1) m.issues.push("duplicate email in file (only the first is imported)");
    }
    return out;
  }, [rows, map]);

  const run = async () => {
    const all: ImportRow[] = mapped.map((m) => ({ code: m.code, pin: m.pin, name: m.name, institution: m.institution, email: m.email, phone: m.phone, members: m.members, source: m.source }));
    setProgress({ done: 0, total: all.length });
    const total: ImportResult = { created: [], skipped: [], failed: [] };
    for (let i = 0; i < all.length; i += CHUNK) {
      const chunk = all.slice(i, i + CHUNK);
      try {
        const r = await importTeams(chunk);
        total.created.push(...r.created);
        total.skipped.push(...r.skipped);
        total.failed.push(...r.failed);
      } catch {
        // Network or server problem: nothing is lost — re-importing the file skips teams already created.
        for (const r of all.slice(i)) total.failed.push({ name: r.name || "(blank)", reason: "Not processed (connection problem). Import the same file again: existing teams are skipped." });
        break;
      }
      setProgress({ done: Math.min(all.length, i + CHUNK), total: all.length });
    }
    setResult(total);
    setProgress(null);
  };

  const downloadCreated = () => {
    if (!result) return;
    const csv = Papa.unparse(result.created.map((c) => ({ team_code: c.code, pin: c.pin, team: c.name })));
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "new-team-logins.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept=".csv,text/csv"
          aria-label="Registration CSV file"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) onFile(f);
          }}
          className="text-sm"
        />
        <span className="text-xs text-muted">Google Sheets → File → Download → Comma-separated values (.csv)</span>
      </div>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      {parseWarnings.length > 0 && (
        <ul className="list-disc pl-5 text-xs text-accent">{parseWarnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
      )}

      {headers.length > 0 && !result && (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            {FIELDS.map((f) => (
              <label key={f.id} className="flex items-center gap-3 text-sm">
                <span className="w-48 shrink-0 text-muted">{f.label}{f.required && " *"}</span>
                <select className={`${ui.input} min-w-0 flex-1`} value={map[f.id] ?? ""} onChange={(e) => setMap((m) => ({ ...m, [f.id]: e.target.value || undefined }))}>
                  <option value="">— not in form —</option>
                  {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </label>
            ))}
          </div>

          <div className="max-h-96 overflow-auto rounded-xl border border-line">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-panel text-muted">
                <tr><th className={ui.th}>Line</th><th className={ui.th}>Team</th><th className={ui.th}>College</th><th className={ui.th}>Email</th><th className={ui.th}>Members</th><th className={ui.th}>Check</th></tr>
              </thead>
              <tbody>
                {mapped.map((m) => (
                  <tr key={m.line} className="border-t border-line align-top">
                    <td className={`${ui.td} text-muted`}>{m.line}</td>
                    <td className={`${ui.td} break-words`}>{m.name}</td>
                    <td className={`${ui.td} text-muted`}>{m.institution}</td>
                    <td className={`${ui.td} break-all text-muted`}>{m.email}</td>
                    <td className={`${ui.td} text-muted`}>{m.members.join(", ")}</td>
                    <td className={ui.td}>{m.issues.length ? <span className="text-accent">{m.issues.join("; ")}</span> : <span className="text-ok">ok</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button className={ui.btn} disabled={!map.name || !!progress || mapped.length === 0} onClick={run}>
              {progress ? `Creating ${progress.done}/${progress.total}…` : `Import ${mapped.length} rows`}
            </button>
            <span className="text-xs text-muted">
              {mapped.filter((m) => m.issues.length).length} row(s) with warnings. Existing team names/emails are skipped, so re-importing is safe.
            </span>
          </div>
        </>
      )}

      {result && (
        <div className="space-y-3 rounded-xl border border-line p-4" role="status">
          <div className="flex flex-wrap gap-4 text-sm">
            <span className="text-ok">Imported: <b>{result.created.length}</b></span>
            <span className="text-muted">Skipped: <b>{result.skipped.length}</b></span>
            <span className={result.failed.length ? "text-danger" : "text-muted"}>Errors: <b>{result.failed.length}</b></span>
          </div>
          {result.failed.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-danger">Errors (need attention)</p>
              <ul className="list-disc pl-5 text-sm">{result.failed.map((s, i) => <li key={i}>{s.name}: {s.reason}</li>)}</ul>
            </div>
          )}
          {result.skipped.length > 0 && (
            <details>
              <summary className="cursor-pointer text-sm text-muted">Skipped rows ({result.skipped.length})</summary>
              <ul className="list-disc pl-5 text-sm text-muted">{result.skipped.map((s, i) => <li key={i}>{s.name}: {s.reason}</li>)}</ul>
            </details>
          )}
          <div className="flex flex-wrap gap-3">
            <Link href="/admin/teams/slips" className={ui.btn}>Print credential slips</Link>
            {result.created.length > 0 && <button className={ui.btnGhost} onClick={downloadCreated}>Download new logins (CSV)</button>}
            <button className={ui.btnGhost} onClick={reset}>Import another file</button>
          </div>
        </div>
      )}
    </div>
  );
}
