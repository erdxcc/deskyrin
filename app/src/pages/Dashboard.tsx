import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function usdc(micro: number) {
  return (micro / 1_000_000).toFixed(2);
}

export function Dashboard() {
  const { user, refreshUser } = useAuth();

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  if (!user) return null;

  const hasWallet = !!user.walletPublicKey;
  const balanceMicro = user.rewardBalanceUsdcMicro ?? 0;

  return (
    <div className="mx-auto max-w-2xl px-5 py-20 sm:py-24">
      <div className="opacity-0-start animate-fade-up">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-primary">
          Dashboard
        </h1>
        <p className="mt-2 text-body text-secondary font-light">{user.email}</p>
      </div>

      <div className="mt-12 space-y-6">
        <div className="glass-panel p-8 opacity-0-start animate-fade-up delay-1">
          <h2 className="text-xs font-medium uppercase tracking-wider text-secondary">
            Reward balance
          </h2>
          <p className="mt-4 font-display text-4xl font-semibold tracking-tight text-primary">
            {usdc(balanceMicro)}{" "}
            <span className="text-lg font-medium text-secondary">USDC</span>
          </p>
        </div>

        <div className="glass-panel p-8 opacity-0-start animate-fade-up delay-2">
          <h2 className="text-xs font-medium uppercase tracking-wider text-secondary">
            Payout address
          </h2>
          {hasWallet ? (
            <>
              <p className="mt-4 font-mono text-xs leading-relaxed text-primary/95 break-all">
                {user.walletPublicKey}
              </p>
              <p className="mt-4 text-body text-secondary font-light">
                Created:{" "}
                {new Date(user.walletCreatedAt!).toLocaleString("en-US", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
              <button
                type="button"
                onClick={() =>
                  navigator.clipboard.writeText(user.walletPublicKey!)
                }
                className="mt-5 text-sm text-violet-300/90 underline-offset-4 transition hover:text-violet-200 hover:underline"
              >
                Copy address
              </button>
            </>
          ) : (
            <p className="mt-4 text-body text-secondary font-light leading-relaxed">
              Appears after your first QR scan while signed in.
            </p>
          )}
        </div>

        <div className="glass-panel border-dashed border-violet-500/20 bg-violet-500/[0.04] p-8 opacity-0-start animate-fade-up delay-3">
          <h2 className="font-display text-base font-semibold text-primary">
            Next step
          </h2>
          <p className="mt-3 text-body text-secondary font-light leading-relaxed">
            Scan a bottle QR while logged in — it links automatically.
          </p>
          <Link
            to="/scan"
            className="btn-gradient mt-6 inline-block px-6 py-2.5 text-sm"
          >
            Go to scan
          </Link>
        </div>
      </div>
    </div>
  );
}
