import { logout } from "@/app/actions/auth";

export default function AppHeader({ area, who }: { area: string; who: string }) {
  return (
    <header className="border-b border-line">
      <div className="tape h-1.5 w-full" />
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <div className="flex items-baseline gap-3">
          <span className="font-bold">The AI Files</span>
          <span className="font-mono text-xs uppercase tracking-widest text-accent">{area}</span>
        </div>
        <div className="ml-auto flex items-center gap-4 text-sm">
          <span className="text-muted">{who}</span>
          <form action={logout}>
            <button className="rounded-md border border-line px-3 py-1.5 hover:border-accent">Log out</button>
          </form>
        </div>
      </div>
    </header>
  );
}
