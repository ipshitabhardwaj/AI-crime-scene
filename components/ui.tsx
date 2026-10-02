import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Small layout building blocks shared by the team, admin and judge screens,
 * so every page has the same structure: page header → "what now" → sections.
 */

export function PageHeader({
  kicker,
  title,
  description,
  actions,
}: {
  kicker?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {kicker && <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">{kicker}</p>}
        <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Section({
  title,
  description,
  actions,
  children,
  className = "",
  id,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`rounded-xl border border-line bg-panel ${className}`}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-3.5">
          <div>
            {title && <h2 className="font-semibold">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export type Tone = "neutral" | "accent" | "ok" | "danger" | "info";
const TONE: Record<Tone, string> = {
  neutral: "border-line bg-ink text-muted",
  accent: "border-accent/40 bg-accent/10 text-accent",
  ok: "border-ok/40 bg-ok/10 text-ok",
  danger: "border-danger/40 bg-danger/10 text-danger",
  info: "border-info/40 bg-info/10 text-info",
};

export function Pill({ tone = "neutral", children, className = "" }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${TONE[tone]} ${className}`}>{children}</span>;
}

export function Progress({ value, max, tone = "accent", label }: { value: number; max: number; tone?: "accent" | "ok"; label?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label} className="h-1.5 w-full overflow-hidden rounded-full bg-line">
      <div className={`h-full rounded-full ${tone === "ok" ? "bg-ok" : "bg-accent"}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Stat({ label, value, note, tone, href }: { label: string; value: ReactNode; note?: ReactNode; tone?: Tone; href?: string }) {
  const body = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-1 text-3xl font-bold tabular-nums ${tone === "danger" ? "text-danger" : tone === "ok" ? "text-ok" : tone === "accent" ? "text-accent" : ""}`}>{value}</p>
      {note && <p className="mt-0.5 text-xs text-muted">{note}</p>}
    </>
  );
  const cls = "block rounded-xl border border-line bg-panel p-4";
  return href ? (
    <Link href={href} className={`${cls} hover:border-accent`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export type StepState = "done" | "current" | "todo";
export type Step = { label: string; state: StepState; hint?: string };

/** Horizontal numbered stepper (wraps to a vertical list on phones). */
export function Stepper({ steps, label = "Progress" }: { steps: Step[]; label?: string }) {
  const cur = Math.max(0, steps.findIndex((s) => s.state === "current"));
  return (
    <>
      <div className="flex items-center gap-3 rounded-lg border border-line bg-panel px-3 py-2 sm:hidden" aria-hidden>
        <div className="flex gap-1">
          {steps.map((s) => (
            <span key={s.label} className={`h-1.5 w-5 rounded-full ${s.state === "done" ? "bg-ok" : s.state === "current" ? "bg-accent" : "bg-line"}`} />
          ))}
        </div>
        <span className="text-xs text-muted">
          Step {cur + 1} of {steps.length} · <b className="text-text">{steps[cur]?.label}</b>
        </span>
      </div>
      <StepperFull steps={steps} label={label} />
    </>
  );
}

function StepperFull({ steps, label }: { steps: Step[]; label: string }) {
  return (
    <ol aria-label={label} className="hidden gap-2 sm:grid sm:grid-flow-col sm:auto-cols-fr">
      {steps.map((s, i) => (
        <li
          key={s.label}
          aria-current={s.state === "current" ? "step" : undefined}
          className={`flex items-center gap-3 rounded-lg border px-3 py-2 sm:flex-col sm:items-start sm:gap-1.5 ${
            s.state === "current" ? "border-accent/60 bg-accent/10" : s.state === "done" ? "border-line bg-panel" : "border-line/60 bg-transparent opacity-70"
          }`}
        >
          <span
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-xs font-bold ${
              s.state === "done" ? "bg-ok text-ink" : s.state === "current" ? "bg-accent text-white" : "border border-line text-muted"
            }`}
          >
            {s.state === "done" ? "✓" : i + 1}
          </span>
          <span className="min-w-0">
            <span className={`block text-sm font-semibold ${s.state === "todo" ? "text-muted" : ""}`}>{s.label}</span>
            {s.hint && <span className="block text-xs text-muted">{s.hint}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** The single most important thing to do now. */
export function NextAction({
  title,
  body,
  href,
  cta,
  tone = "accent",
  children,
}: {
  title: ReactNode;
  body?: ReactNode;
  href?: string;
  cta?: string;
  tone?: "accent" | "ok" | "neutral" | "danger";
  children?: ReactNode;
}) {
  const border = tone === "ok" ? "border-ok/50 bg-ok/5" : tone === "danger" ? "border-danger/50 bg-danger/5" : tone === "neutral" ? "border-line bg-panel" : "border-accent/60 bg-accent/5";
  return (
    <section aria-label="What to do now" className={`flex flex-col gap-4 rounded-xl border p-5 sm:flex-row sm:items-center ${border}`}>
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">What to do now</p>
        <p className="mt-1 text-lg font-semibold">{title}</p>
        {body && <p className="mt-1 text-sm text-muted">{body}</p>}
      </div>
      {href && cta && (
        <Link prefetch={false} href={href} className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-accent px-5 py-2.5 font-semibold text-white hover:brightness-110">
          {cta} →
        </Link>
      )}
      {children}
    </section>
  );
}

export function EmptyState({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line p-10 text-center">
      <p className="font-mono text-sm uppercase tracking-widest text-accent">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-lg text-sm text-muted">{children}</div>}
    </div>
  );
}

/** Label/value list used in report and judge views. */
export function Field({ label, children, mono }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className={`mt-0.5 whitespace-pre-wrap break-words text-sm ${mono ? "font-mono" : ""}`}>{children || <span className="text-muted">—</span>}</dd>
    </div>
  );
}
