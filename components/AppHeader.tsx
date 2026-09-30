import { logout } from "@/app/actions/auth";

export default function AppHeader({ area, who }: { area: string; who: string }) {
  return (
    <header className="border-b border-line bg-ink">
      <div className="tape h-1.5 w-full" />
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <div className="flex min-w-0 items-baseline gap-3">
          <span className="whitespace-nowrap font-bold tracking-tight">The AI Files</span>
          <span className="hidden rounded border border-accent/40 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-accent sm:inline">{area}</span>
        </div>
        <div className="ml-auto flex min-w-0 items-center gap-3 text-sm">
          <span className="truncate text-muted" title={who}>
            {who}
          </span>
          <form action={logout}>
            <button className="whitespace-nowrap rounded-md border border-line px-3 py-1.5 hover:border-accent">Log out</button>
          </form>
        </div>
      </div>
    </header>
  );
}
