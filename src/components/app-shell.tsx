import { AppNavigation, Logo } from "@/components/navigation";
import { siteConfig } from "@/config/site";
import { FocusRuntime } from "@/features/focus/focus-runtime";
import type { FocusSession } from "@/features/focus/types";

export function AppShell({
  children,
  locale,
  initialFocusSession = null,
}: {
  children: React.ReactNode;
  locale: "es" | "en";
  initialFocusSession?: FocusSession | null;
}) {
  const copy =
    locale === "es"
      ? { skip: "Saltar al contenido", nav: "Navegación principal" }
      : { skip: "Skip to content", nav: "Primary navigation" };

  return (
    <FocusRuntime initialSession={initialFocusSession}>
      <div className="app-shell">
        <a className="skip-link" href="#main-content">
          {copy.skip}
        </a>
        <aside className="sidebar">
          <Logo />
          <nav className="side-links" aria-label={copy.nav}>
            <AppNavigation variant="desktop" />
          </nav>
          <p className="muted" style={{ marginTop: "auto", fontSize: 12 }}>
            Planora · v{siteConfig.version}
          </p>
        </aside>
        <main className="main" id="main-content" tabIndex={-1}>
          {children}
        </main>
        <nav className="mobile-nav" aria-label={copy.nav}>
          <AppNavigation variant="mobile" />
        </nav>
      </div>
    </FocusRuntime>
  );
}
