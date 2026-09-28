import LoginForm from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col">
      <div className="tape h-3 w-full" />
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-accent">Event 07 · Tech investigation</p>
          <h1 className="mt-2 text-4xl font-bold">The AI Files</h1>
          <p className="mt-1 text-lg text-muted">Decode the Crime</p>
          <div className="mt-8">
            <LoginForm />
          </div>
          <p className="mt-6 font-mono text-xs text-muted">Observe → Analyse → Connect → Investigate → Decode</p>
        </div>
      </div>
    </main>
  );
}
