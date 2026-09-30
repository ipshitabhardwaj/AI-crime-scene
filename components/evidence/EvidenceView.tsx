import type { EvidenceRow } from "@/lib/types";

/**
 * Renders one evidence item in its "native" look.
 * Content shapes per type are documented in README → Case file format.
 * Unknown / malformed content falls back to raw JSON so nothing is hidden.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export default function EvidenceView({ evidence }: { evidence: EvidenceRow }) {
  const c = (evidence.content ?? {}) as any;
  switch (evidence.type) {
    case "log":
      return <LogView lines={asArray<unknown>(c.lines).map(String)} />;
    case "chat":
      return <ChatView channel={c.channel} messages={asArray<any>(c.messages)} />;
    case "email":
      return <EmailView c={c} />;
    case "db":
      return <TableView table={c.table} columns={asArray<unknown>(c.columns).map(String)} rows={asArray<any[]>(c.rows)} />;
    case "api":
      return <ApiView c={c} />;
    case "code":
      return <CodeView filename={c.filename} language={c.language} source={String(c.source ?? "")} />;
    case "screenshot":
      return <ScreenshotView c={c} />;
    case "ai_output":
      return <AiView c={c} />;
    case "note":
      return <div className="whitespace-pre-wrap break-words rounded-lg border border-line bg-panel p-5 text-[15px] leading-relaxed">{String(c.body_md ?? "")}</div>;
    default:
      return <Raw value={c} />;
  }
}

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function Raw({ value }: { value: unknown }) {
  return <pre className="overflow-x-auto rounded-lg border border-line bg-black/40 p-4 font-mono text-sm">{JSON.stringify(value, null, 2)}</pre>;
}

/**
 * Activity records. Plain-language lines ("02:17  Something happened") are
 * shown as a readable time list; old technical log lines still render.
 */
function LogView({ lines }: { lines: string[] }) {
  return (
    <ol className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-panel">
      {lines.map((line, i) => {
        const m = line.match(/^(\d{1,2}:\d{2}(?::\d{2})?)\s+(.*)$/);
        const text = m ? m[2] : line;
        const tone = /\b(ERROR|FATAL|FAILED|CRIT|DELETED|REFUSED|FULL|FIRE ALERT|EVACUATE|BLOCKED)\b/.test(text)
          ? "border-l-danger"
          : /\b(WARN(ING)?|NOTE)\b/.test(text)
            ? "border-l-accent"
            : "border-l-transparent";
        return (
          <li key={i} className={`flex gap-4 border-l-4 px-4 py-2.5 ${tone}`}>
            <span className="w-20 shrink-0 font-mono text-sm text-accent">{m ? m[1] : ""}</span>
            <span className="min-w-0 break-words leading-relaxed">{text}</span>
          </li>
        );
      })}
    </ol>
  );
}

function ChatView({ channel, messages }: { channel?: string; messages: { from: string; at?: string; text: string }[] }) {
  return (
    <div className="rounded-lg border border-line bg-panel">
      {channel && <div className="border-b border-line px-4 py-2 font-mono text-sm text-muted">{channel}</div>}
      <div className="space-y-3 p-4">
        {messages.map((m, i) => (
          <div key={i} className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/20 text-sm font-bold text-accent">
              {String(m.from ?? "?").slice(0, 1).toUpperCase()}
            </div>
            <div>
              <div className="text-sm">
                <span className="font-semibold">{String(m.from ?? "")}</span>
                {m.at && <span className="ml-2 font-mono text-xs text-muted">{String(m.at)}</span>}
              </div>
              <div className="mt-0.5 whitespace-pre-wrap break-words">{String(m.text ?? "")}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmailView({ c }: { c: any }) {
  const row = (k: string, v?: unknown) =>
    v ? (
      <div className="flex gap-3 text-sm">
        <span className="w-16 shrink-0 text-muted">{k}</span>
        <span className="break-all">{String(v)}</span>
      </div>
    ) : null;
  return (
    <div className="rounded-lg border border-line bg-panel">
      <div className="space-y-1 border-b border-line p-4">
        <div className="mb-2 text-lg font-semibold">{String(c.subject ?? "(no subject)")}</div>
        {row("From", c.from)}
        {row("To", c.to)}
        {row("Cc", c.cc)}
        {row("Sent", c.sent_at)}
      </div>
      <div className="whitespace-pre-wrap p-4 leading-relaxed">{String(c.body_md ?? "")}</div>
    </div>
  );
}

function TableView({ table, columns, rows }: { table?: string; columns: string[]; rows: unknown[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      {table && <div className="border-b border-line bg-panel px-4 py-2 text-sm font-semibold">{table}</div>}
      <table className="w-full text-sm">
        <thead className="bg-panel text-left text-muted">
          <tr>{columns.map((col) => <th key={col} className="whitespace-nowrap px-3 py-2 font-medium">{col}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line">
              {asArray<unknown>(r).map((cell, j) => (
                <td key={j} className="px-3 py-2 align-top">{cell === null ? <span className="text-muted">NULL</span> : String(cell)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ApiView({ c }: { c: any }) {
  const status = Number(c.status);
  const statusCls = status >= 500 ? "text-danger" : status >= 400 ? "text-accent" : "text-ok";
  return (
    <div className="rounded-lg border border-line bg-black/50 font-mono text-[13px]">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2">
        <span className="rounded bg-sky-500/20 px-2 py-0.5 text-sky-300">{String(c.method ?? "GET")}</span>
        <span className="break-all text-text/90">{String(c.url ?? "")}</span>
        {c.status !== undefined && <span className={`ml-auto font-semibold ${statusCls}`}>{String(c.status)}</span>}
      </div>
      {c.headers && (
        <pre className="overflow-x-auto border-b border-line px-4 py-2 text-muted">
          {Object.entries(c.headers as Record<string, unknown>).map(([k, v]) => `${k}: ${String(v)}`).join("\n")}
        </pre>
      )}
      <pre className="whitespace-pre-wrap break-words p-4 leading-6">{typeof c.body === "string" ? c.body : JSON.stringify(c.body, null, 2)}</pre>
    </div>
  );
}

function CodeView({ filename, language, source }: { filename?: string; language?: string; source: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <div className="flex items-center justify-between border-b border-line bg-panel px-4 py-2 font-mono text-sm">
        <span>{filename ?? "snippet"}</span>
        {language && <span className="text-muted">{language}</span>}
      </div>
      <pre className="overflow-x-auto bg-black/60 p-4 font-mono text-[13px] leading-6">
        {source.split("\n").map((l, i) => (
          <div key={i} className="whitespace-pre">
            <span className="mr-4 inline-block w-6 select-none text-right text-muted/50">{i + 1}</span>
            <span className={l.trim().startsWith("#") || l.trim().startsWith("//") ? "text-muted italic" : ""}>{l}</span>
          </div>
        ))}
      </pre>
    </div>
  );
}

function ScreenshotView({ c }: { c: any }) {
  const raw = String(c.image_url ?? c.image_path ?? "");
  const src = /^(https:\/\/|\/)/.test(raw) ? raw : "";
  return (
    <figure className="rounded-lg border border-line bg-panel p-3">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={String(src)} alt={c.caption ?? "evidence screenshot"} className="mx-auto max-h-[70vh] rounded" />
      ) : (
        <div className="p-10 text-center text-muted">Image missing</div>
      )}
      {c.caption && <figcaption className="mt-2 text-center text-sm text-muted">{c.caption}</figcaption>}
    </figure>
  );
}

function AiView({ c }: { c: any }) {
  return (
    <div className="space-y-3">
      {c.prompt && (
        <div className="ml-auto max-w-[85%] rounded-lg rounded-br-none bg-sky-500/15 p-3">
          <div className="mb-1 text-xs text-muted">Prompt</div>
          <div className="whitespace-pre-wrap break-words">{String(c.prompt)}</div>
        </div>
      )}
      <div className="max-w-[90%] rounded-lg rounded-bl-none border border-line bg-panel p-4">
        <div className="mb-1 font-mono text-xs text-accent">✦ {String(c.model ?? "AI model")}</div>
        <div className="whitespace-pre-wrap leading-relaxed">{String(c.output ?? "")}</div>
      </div>
    </div>
  );
}
