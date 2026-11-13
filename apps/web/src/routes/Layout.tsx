import { NavLink, Outlet } from "react-router";

const navClass = ({ isActive }: { isActive: boolean }) =>
  `text-sm tracking-wide uppercase hover:text-accent ${isActive ? "text-accent font-semibold" : "text-muted"}`;

export function Layout() {
  const today = new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b-4 border-double border-ink/80">
        <div className="mx-auto max-w-5xl px-4 pt-6 pb-3">
          <div className="flex justify-between text-xs text-muted uppercase tracking-widest">
            <span>{today}</span>
            <span className="hidden sm:inline">Credibility desk</span>
          </div>
          <NavLink to="/" className="block text-center font-display font-extrabold text-5xl sm:text-6xl tracking-tight my-3">
            Veritas
          </NavLink>
          <nav className="flex justify-center gap-6 border-t border-rule pt-3">
            <NavLink to="/" end className={navClass}>Check</NavLink>
            <NavLink to="/history" className={navClass}>History</NavLink>
            <NavLink to="/methodology" className={navClass}>Methodology</NavLink>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 py-8 flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-rule py-6 text-center text-xs text-muted px-4">
        Veritas is an assistive tool. Scores are estimates based on observable signals, not verdicts. Always read the evidence.
      </footer>
    </div>
  );
}
