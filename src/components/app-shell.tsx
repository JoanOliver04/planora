import { AppNavigation, Logo } from "@/components/navigation";
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Logo />
        <nav className="side-links">
          <AppNavigation variant="desktop" />
        </nav>
        <p className="muted" style={{ marginTop: "auto", fontSize: 12 }}>
          Planora · v0.1.0
        </p>
      </aside>
      <main className="main">{children}</main>
      <nav className="mobile-nav">
        <AppNavigation variant="mobile" />
      </nav>
    </div>
  );
}
