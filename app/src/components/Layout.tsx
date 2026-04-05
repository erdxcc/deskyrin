import { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Logo } from "./Logo";

export function Layout() {
  const { user, logout } = useAuth();
  const loc = useLocation();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="relative min-h-screen flex flex-col bg-void text-primary">
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="ambient-blob -top-32 right-[-10%] h-[420px] w-[420px] bg-violet-600/25" />
        <div className="ambient-blob top-[35%] -left-32 h-[360px] w-[360px] bg-blue-600/20" />
        <div className="ambient-blob bottom-0 right-[20%] h-[280px] w-[280px] bg-indigo-500/15" />
        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(124, 58, 237, 0.15), transparent)",
          }}
        />
      </div>

      <header
        className={`sticky top-0 z-20 border-b transition-all duration-500 ease-smooth ${
          scrolled
            ? "border-white/[0.08] bg-panel/75 shadow-lift backdrop-blur-xl"
            : "border-transparent bg-transparent backdrop-blur-none"
        }`}
      >
        <div className="mx-auto flex h-[4.25rem] max-w-5xl items-center justify-between px-5 sm:px-8">
          <Logo />
          <nav className="flex items-center gap-7 text-sm font-medium tracking-tight text-secondary">
            {user ? (
              <>
                <Link
                  to="/app"
                  className={`transition-colors duration-300 ease-smooth hover:text-primary ${
                    loc.pathname === "/app" ? "text-primary" : ""
                  }`}
                >
                  Dashboard
                </Link>
                <Link
                  to="/scan"
                  className={`transition-colors duration-300 ease-smooth hover:text-primary ${
                    loc.pathname === "/scan" ? "text-primary" : ""
                  }`}
                >
                  Scan
                </Link>
                <button
                  type="button"
                  onClick={logout}
                  className="text-secondary transition-colors duration-300 ease-smooth hover:text-primary font-normal"
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="transition-colors duration-300 ease-smooth hover:text-primary font-normal"
                >
                  Log in
                </Link>
                <Link to="/register" className="btn-gradient px-5 py-2.5 text-xs sm:text-sm">
                  Get started
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="relative z-10 flex-1">
        <Outlet />
      </main>

      <footer className="relative z-10 border-t border-white/[0.06] py-14 text-center">
        <p className="font-display text-xs font-semibold uppercase tracking-brand text-secondary">
          Deskyrin
        </p>
        <p className="mt-4 mx-auto max-w-md font-display text-sm font-medium tracking-tight text-secondary/90 sm:text-base">
          Closing the loop, block by block.
        </p>
      </footer>
    </div>
  );
}
