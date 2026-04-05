import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { PublicPartner } from "../api/types";
import { Reveal } from "../components/Reveal";
import { useAuth } from "../context/AuthContext";
import { Logo } from "../components/Logo";

const VALUE_CARDS = [
  "Real value, not points.",
  "Verified. Traceable. Immutable.",
  "Transparency for everyone.",
] as const;

const STEPS = [
  {
    n: "01",
    title: "Connect",
    body: <>One account, all partners.</>,
  },
  {
    n: "02",
    title: "Claim",
    body: (
      <>
        Scan the QR. <span className="font-mono text-[0.95em] text-violet-200/90">Mint</span>{" "}
        your proof.
      </>
    ),
  },
  {
    n: "03",
    title: "Settle",
    body: (
      <>
        Drop off. Collect{" "}
        <span className="font-mono text-[0.95em] text-violet-200/90">USDC</span>.
      </>
    ),
  },
] as const;

export function Home() {
  const { user } = useAuth();
  const [partners, setPartners] = useState<PublicPartner[]>([]);

  useEffect(() => {
    void api
      .listPartners()
      .then((r) => setPartners(r.partners))
      .catch(() => setPartners([]));
  }, []);

  return (
    <div className="mx-auto w-full max-w-[min(100%,92rem)] px-3 py-16 sm:px-5 sm:py-24 md:px-8 md:py-28">
      {/* —— Hero + value props: прозрачная размытая «рамка» (frosted) —— */}
      <div className="relative w-full">
        <section
          className="relative w-full overflow-hidden rounded-3xl border border-white/[0.05] bg-white/[0.015] px-5 py-12 shadow-none backdrop-blur-2xl backdrop-saturate-100 sm:px-10 sm:py-14 md:px-14 md:py-16 md:backdrop-blur-3xl lg:px-16"
          aria-labelledby="value-heading"
        >
          <Reveal>
            <Logo large />
          </Reveal>

          <Reveal delayMs={120} className="relative mt-12 max-w-5xl sm:mt-16 md:mt-16">
            <h1 className="font-display flex flex-nowrap items-baseline gap-2 text-4xl font-semibold leading-none tracking-tight text-primary sm:gap-3 sm:text-5xl md:gap-4 md:text-6xl lg:text-7xl">
              <span className="whitespace-nowrap">Scan. Return.</span>
              <span className="text-gradient whitespace-nowrap">Earn USDC.</span>
            </h1>
            <p className="mt-6 font-display text-xl font-medium tracking-tight text-secondary/90 sm:mt-8 sm:text-2xl md:text-2xl lg:text-3xl">
              Every bottle matters.
            </p>
          </Reveal>

          <Reveal delayMs={280} className="relative mt-10 flex flex-wrap gap-4 sm:mt-12 md:mt-14">
            {user ? (
              <Link to="/scan" className="btn-gradient px-8 py-3.5">
                Scan packaging QR
              </Link>
            ) : (
              <>
                <Link to="/register" className="btn-gradient px-8 py-3.5">
                  Get started
                </Link>
                <Link to="/login" className="btn-ghost px-8 py-3.5">
                  I have an account
                </Link>
              </>
            )}
          </Reveal>

          {/* Why Deskyrin — один ряд, мягкие прямоугольники */}
          <div className="relative mt-12 pb-12 sm:mt-14 sm:pb-14 md:mt-16 md:pb-16">
            <Reveal delayMs={100} className="mb-8 w-full sm:mb-10">
              <p
                id="value-heading"
                className="text-center font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-slate-500 sm:text-[11px]"
              >
                Why Deskyrin
              </p>
            </Reveal>
            <ul
              className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-4 sm:gap-5 md:grid-cols-3 md:gap-6"
              aria-label="Why Deskyrin"
            >
              {VALUE_CARDS.map((line, i) => (
                <Reveal key={line} delayMs={i * 220} className="min-w-0">
                  <div
                    className="h-full rounded-[1.35rem] border border-white/[0.1] bg-white/[0.06] px-5 py-6 backdrop-blur-xl transition-all duration-300 hover:border-violet-400/30 hover:shadow-[0_20px_50px_-20px_rgba(124,58,237,0.35)] sm:rounded-[1.5rem] sm:px-6 sm:py-7 md:py-8"
                    style={{
                      boxShadow:
                        "inset 0 1px 0 0 rgba(255,255,255,0.08), 0 16px 48px -28px rgba(0,0,0,0.5)",
                    }}
                  >
                    <p className="font-display text-sm font-medium leading-snug tracking-tight text-primary/95 sm:text-base md:text-lg">
                      {line === "Verified. Traceable. Immutable." ? (
                        <>
                          Verified. Traceable.{" "}
                          <span className="font-mono text-[0.92em] text-violet-200/90">
                            Immutable
                          </span>
                          .
                        </>
                      ) : (
                        line
                      )}
                    </p>
                  </div>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>
      </div>

      <div className="h-12 sm:h-16 md:h-20" aria-hidden />

      {/* —— Process stepper —— */}
      <Reveal>
        <section
          className="border-t border-white/[0.06] py-20 sm:py-24 md:py-28"
          aria-labelledby="steps-heading"
        >
          <div className="mb-12 md:mb-16">
            <p
              id="steps-heading"
              className="font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-violet-400/80"
            >
              How it works
            </p>
          </div>

          {/* Mobile: vertical stepper */}
          <ol className="relative space-y-0 md:hidden">
            {STEPS.map((step, i) => (
              <li key={step.n} className="relative flex gap-6 pb-24 last:pb-0">
                {i < STEPS.length - 1 && (
                  <div
                    className="absolute left-4 top-9 bottom-0 w-px bg-gradient-to-b from-violet-500/35 via-white/[0.08] to-transparent"
                    aria-hidden
                  />
                )}
                <div className="relative z-[1] flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-violet-500/30 bg-[rgba(124,58,237,0.08)] font-mono text-[10px] font-medium text-violet-200/90">
                  {step.n}
                </div>
                <div className="min-w-0 pt-0.5">
                  <h3 className="font-display text-xl font-semibold tracking-tight text-primary">
                    {step.title}
                  </h3>
                  <p className="mt-3 text-body text-secondary font-light leading-relaxed">
                    {step.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          {/* Desktop: horizontal process + connectors */}
          <ol className="relative hidden md:flex md:w-full md:items-stretch md:gap-10 lg:gap-14">
            {STEPS.map((step, i) => (
              <li
                key={step.n}
                className="relative flex min-w-0 flex-1 flex-col items-center"
              >
                <div className="flex w-full items-center justify-center">
                  {i > 0 ? (
                    <div
                      className="h-px min-w-[12px] flex-1 bg-gradient-to-l from-violet-500/40 to-transparent"
                      aria-hidden
                    />
                  ) : (
                    <div className="min-w-[12px] flex-1" aria-hidden />
                  )}
                  <span className="mx-4 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-violet-500/35 bg-[rgba(124,58,237,0.08)] font-mono text-xs font-medium text-violet-200/90 lg:mx-5">
                    {step.n}
                  </span>
                  {i < STEPS.length - 1 ? (
                    <div
                      className="h-px min-w-[12px] flex-1 bg-gradient-to-r from-violet-500/40 to-transparent"
                      aria-hidden
                    />
                  ) : (
                    <div className="min-w-[12px] flex-1" aria-hidden />
                  )}
                </div>
                <article className="mt-14 w-full max-w-sm flex-1 rounded-2xl border border-white/[0.09] bg-[rgba(255,255,255,0.02)] p-8 backdrop-blur-sm lg:mt-16 lg:p-9">
                  <h3 className="font-display text-xl font-semibold tracking-tight text-primary lg:text-2xl">
                    {step.title}
                  </h3>
                  <p className="mt-4 text-body text-secondary font-light leading-relaxed">
                    {step.body}
                  </p>
                </article>
              </li>
            ))}
          </ol>
        </section>
      </Reveal>

      {partners.length > 0 && (
        <Reveal delayMs={220}>
          <section className="border-t border-white/[0.06] py-20 sm:py-24 md:py-28">
            <h2 className="font-display text-2xl font-semibold tracking-tight text-primary md:text-3xl">
              Partner
            </h2>
            <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:mt-14">
              {partners.map((p, i) => (
                <li key={p.id}>
                  <Reveal delayMs={i * 200}>
                    <Link
                      to={`/partners/${encodeURIComponent(p.id)}`}
                      className="glass-panel-interactive block rounded-2xl p-7 text-left sm:p-8"
                    >
                      <p className="font-display text-lg font-semibold text-primary">
                        {p.name}
                      </p>
                      <p className="mt-4 text-sm text-violet-300/85">
                        Pay with rewards →
                      </p>
                    </Link>
                  </Reveal>
                </li>
              ))}
            </ul>
          </section>
        </Reveal>
      )}
    </div>
  );
}
