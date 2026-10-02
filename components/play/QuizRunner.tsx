"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { readAnswers, saveAnswer, type ActionResult } from "@/app/actions/team";
import { LETTERS } from "@/lib/scoring";
import type { Question } from "@/lib/types";
import { SaveIndicator, useAutosave } from "./useAutosave";

/** How often an open quiz re-checks for a teammate's answers on another device. */
const SYNC_MS = 20_000;

type Answers = Record<string, number>;

/**
 * One question per screen: the clue on a sheet of paper, the question, four
 * options. Picking an option saves it straight away. Back / Next move between
 * questions; the numbered dots jump to any question.
 */
export default function QuizRunner({
  questions,
  initialAnswers,
  round1Writable,
  twistWritable,
  closedReason,
  reportLabel,
}: {
  questions: Question[];
  initialAnswers: Answers;
  round1Writable: boolean;
  twistWritable: boolean;
  closedReason: string;
  reportLabel: string;
}) {
  const canAnswer = (q: Question) => (q.twist ? twistWritable : round1Writable);
  const anyWritable = round1Writable || twistWritable;

  const [answers, setAnswers] = useState<Answers>(initialAnswers);
  const [index, setIndex] = useState(() => {
    const first = questions.findIndex((q) => canAnswer(q) && !initialAnswers[q.id]);
    if (first >= 0) return first;
    const firstOpen = questions.findIndex((q) => canAnswer(q));
    return firstOpen >= 0 ? firstOpen : 0;
  });
  const [teammate, setTeammate] = useState(false);

  // Save only the answers that changed since the last successful save.
  const saved = useRef<Answers>(initialAnswers);
  const { state, error, adopt } = useAutosave(
    answers,
    async (v): Promise<ActionResult> => {
      for (const id of Object.keys(v)) {
        if (saved.current[id] === v[id]) continue;
        const r = await saveAnswer(id, v[id]);
        if (!r.ok) return r;
        saved.current = { ...saved.current, [id]: v[id] };
      }
      return { ok: true };
    },
    anyWritable,
    250,
  );

  // After each successful save, refresh the tab badges ("3/8 answered").
  const router = useRouter();
  useEffect(() => {
    if (state === "saved") router.refresh();
  }, [state, router]);

  // Same team, several devices: every ~20 s (only while this tab is visible
  // and nothing is being saved here) take over the team's latest answers.
  const live = useRef({ answers, state });
  useEffect(() => {
    live.current = { answers, state };
  });
  useEffect(() => {
    if (!anyWritable) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const busy = (s: string) => s === "pending" || s === "saving" || s === "offline";
    const tick = async () => {
      if (document.visibilityState === "visible" && !busy(live.current.state)) {
        const before = JSON.stringify(live.current.answers);
        try {
          const server = await readAnswers();
          const now = live.current;
          if (!cancelled && server && JSON.stringify(now.answers) === before && !busy(now.state)) {
            const merged = { ...now.answers, ...server };
            if (JSON.stringify(merged) !== before) {
              saved.current = merged;
              adopt(merged);
              setAnswers(merged);
              setTeammate(true);
            }
          }
        } catch {
          /* offline: try again next time */
        }
      }
      if (!cancelled) timer = setTimeout(tick, SYNC_MS * (0.8 + Math.random() * 0.4));
    };
    timer = setTimeout(tick, SYNC_MS * (0.5 + Math.random() * 0.5));
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [adopt, anyWritable]);

  if (questions.length === 0) return <p className="rounded-xl border border-dashed border-line p-8 text-center text-muted">No questions yet.</p>;

  const q = questions[Math.min(index, questions.length - 1)];
  const open = canAnswer(q);
  const choice = answers[q.id];
  const last = index >= questions.length - 1;
  // The last question that can still be answered leads on to the report
  // (after the twist, the locked round-1 questions come after the new ones).
  const lastOpen = anyWritable && index === questions.reduce((m, x, i) => (canAnswer(x) ? i : m), -1);
  const openQs = questions.filter(canAnswer);
  const left = openQs.filter((x) => !answers[x.id]).length;
  const numberOf = (x: Question) => (x.twist ? `New ${questions.filter((y) => y.twist).indexOf(x) + 1}` : `${questions.filter((y) => !y.twist).indexOf(x) + 1}`);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <ol aria-label="Questions" className="flex flex-wrap gap-1.5">
          {questions.map((x, i) => {
            const done = !!answers[x.id];
            const cur = i === index;
            return (
              <li key={x.id}>
                <button
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-label={`Question ${numberOf(x)}${done ? ", answered" : ", not answered"}`}
                  aria-current={cur ? "step" : undefined}
                  className={`flex h-9 min-w-9 items-center justify-center rounded-md border px-2 font-mono text-xs font-bold ${
                    cur ? "border-text bg-text text-ink" : done ? "border-accent bg-accent text-white" : x.twist ? "border-danger/70 text-danger" : "border-line text-muted hover:border-accent"
                  }`}
                >
                  {numberOf(x)}
                </button>
              </li>
            );
          })}
        </ol>
        <span className="ml-auto">
          <SaveIndicator state={state} error={error} />
        </span>
      </div>

      {teammate && (
        <p role="status" className="rounded-md border border-info/40 bg-info/10 px-3 py-1.5 text-xs text-info">
          A teammate answered on another device — their answers are shown here too.
        </p>
      )}

      <article className="exhibit p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className="stamp text-[#b3121f]">{q.twist ? "New evidence" : "Exhibit"} {q.code}</span>
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-[#6b5a5c]">{q.clue.label}</span>
        </div>
        {q.clue.title && <h2 className="mt-3 text-lg font-bold">{q.clue.title}</h2>}
        <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed">{q.clue.text}</p>
      </article>

      <section aria-label="Question">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">
          {q.twist ? "New question" : "Question"} {numberOf(q).replace("New ", "")} of {questions.filter((x) => x.twist === q.twist).length}
        </p>
        <h2 className="mt-1 text-xl font-bold sm:text-2xl">{q.question}</h2>
        <div className="mt-4 grid gap-2.5" role="radiogroup" aria-label="Answer options">
          {q.options.map((o, i) => {
            const on = choice === i + 1;
            return (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={!open}
                onClick={() => {
                  setTeammate(false);
                  setAnswers((a) => ({ ...a, [q.id]: i + 1 }));
                }}
                className={`flex items-start gap-3 rounded-xl border-2 px-4 py-3 text-left text-base disabled:cursor-not-allowed ${
                  on ? "border-accent bg-accent/20" : "border-line bg-panel hover:border-accent/70 disabled:opacity-60 disabled:hover:border-line"
                }`}
              >
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-sm font-bold ${on ? "bg-accent text-white" : "border border-line text-muted"}`}>{LETTERS[i]}</span>
                <span className="pt-0.5">{o}</span>
              </button>
            );
          })}
        </div>
        {!open && <p className="mt-3 text-sm text-muted">🔒 {q.twist || !twistWritable ? closedReason || "This question is locked." : "Round 1 answers are locked. You can still read the clue."}</p>}
      </section>

      <div className="flex items-center gap-3 border-t border-line pt-4">
        <button type="button" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0} className="rounded-lg border border-line px-4 py-2.5 text-sm font-semibold hover:border-accent disabled:opacity-40">
          ← Back
        </button>
        {anyWritable && <span className="text-sm text-muted">{left === 0 ? "All answered ✓" : `${left} left`}</span>}
        {last || lastOpen ? (
          <Link prefetch={false} href="/play/report" className="ml-auto rounded-lg bg-accent px-6 py-2.5 text-base font-bold text-white hover:brightness-110">
            {reportLabel} →
          </Link>
        ) : (
          <button type="button" onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))} className="ml-auto rounded-lg bg-accent px-6 py-2.5 text-base font-bold text-white hover:brightness-110">
            Next →
          </button>
        )}
      </div>
    </div>
  );
}
