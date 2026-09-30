import LoginForm from "@/components/LoginForm";

const STEPS = [
  ["Observe", "Read every piece of evidence"],
  ["Analyse", "Tag it relevant, misleading or noise"],
  ["Connect", "Build the incident timeline"],
  ["Investigate", "Submit an Initial Conclusion, then face the twist"],
  ["Decode", "Submit the final case report"],
];

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col">
      <div className="tape h-3 w-full" />
      <div className="mx-auto grid w-full max-w-5xl flex-1 items-center gap-10 px-4 py-12 md:grid-cols-[1.1fr_1fr]">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-accent">Event 07 · Tech investigation</p>
          <h1 className="mt-3 text-5xl font-black tracking-tight md:text-6xl">The AI Files</h1>
          <p className="mt-2 text-xl text-muted">Decode the Crime</p>
          <span className="stamp mt-6 text-danger/80">Case files · restricted</span>
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
          <p className="mt-4 text-center font-mono text-xs text-muted md:hidden">Observe → Analyse → Connect → Investigate → Decode</p>
        </div>
      </div>
      <div className="tape h-3 w-full" />
    </main>
  );
}
