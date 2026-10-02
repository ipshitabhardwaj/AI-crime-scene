import CrimeTape from "@/components/CrimeTape";
import LoginForm from "@/components/LoginForm";

const STEPS = [
  ["Read", "A short case and its suspects"],
  ["Examine", "One clue per question"],
  ["Accuse", "Name who did it"],
  ["Twist", "New evidence arrives"],
  ["Decode", "Give your final answer"],
];

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col">
      <CrimeTape />
      <div className="mx-auto grid w-full max-w-5xl flex-1 items-center gap-10 px-4 py-12 md:grid-cols-[1.1fr_1fr]">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-accent">Event 07 · Detective challenge</p>
          <h1 className="mt-3 text-5xl font-black tracking-tight md:text-6xl">The AI Files</h1>
          <p className="type mt-2 text-2xl font-bold uppercase tracking-widest text-accent">Decode the Crime</p>
          <span className="stamp mt-6 text-accent">Case files · restricted</span>
          <ol className="mt-8 hidden space-y-3 md:block">
            {STEPS.map(([t, d], i) => (
              <li key={t} className="flex items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full border border-accent/50 font-mono text-xs text-accent">{i + 1}</span>
                <span>
                  <span className="font-semibold">{t}</span> <span className="text-sm text-muted">— {d}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <LoginForm />
          <p className="mt-4 text-center font-mono text-xs text-muted md:hidden">Read → Examine → Accuse → Twist → Decode</p>
        </div>
      </div>
      <CrimeTape />
    </main>
  );
}
