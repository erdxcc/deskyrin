import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { PublicPartner } from "../api/types";
import { useAuth } from "../context/AuthContext";

function usdc(micro: number) {
  return (micro / 1_000_000).toFixed(2);
}

function parseAmountToMicro(raw: string): number | null {
  const n = Number.parseFloat(raw.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  const micro = Math.round(n * 1_000_000);
  return micro > 0 ? micro : null;
}

export function PartnerStore() {
  const { partnerId = "" } = useParams<{ partnerId: string }>();
  const { user, token, refreshUser } = useAuth();
  const [partner, setPartner] = useState<PublicPartner | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [amountStr, setAmountStr] = useState("1.00");
  const [submitting, setSubmitting] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!partnerId.trim()) {
      setPartner(null);
      setLoadErr("Partner not found.");
      return;
    }
    setLoadErr(null);
    void api
      .getPartner(partnerId)
      .then(setPartner)
      .catch(() => {
        setPartner(null);
        setLoadErr("Partner not found.");
      });
  }, [partnerId]);

  const balanceMicro = user?.rewardBalanceUsdcMicro ?? 0;

  async function payWithRewards() {
    if (!token || !partner) return;
    setFormErr(null);
    setOkMsg(null);
    const micro = parseAmountToMicro(amountStr.trim());
    if (micro == null) {
      setFormErr("Enter a valid amount.");
      return;
    }
    if (micro > balanceMicro) {
      setFormErr("Amount exceeds your reward balance.");
      return;
    }
    setSubmitting(true);
    try {
      await api.redeemRewards(token, {
        partnerId: partner.id,
        amountUsdcMicro: micro,
      });
      await refreshUser();
      setOkMsg(`Paid ${usdc(micro)} USDC with your rewards.`);
      setAmountStr("0.00");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Payment failed";
      if (msg.includes("INSUFFICIENT_BALANCE")) {
        setFormErr("Insufficient balance.");
      } else {
        setFormErr(msg);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loadErr && !partner) {
    return (
      <div className="mx-auto max-w-xl px-5 py-20 sm:py-24">
        <p className="text-body text-secondary font-light">{loadErr}</p>
        <Link
          to="/"
          className="mt-8 inline-block text-sm text-violet-300/90 underline-offset-4 hover:underline"
        >
          Back home
        </Link>
      </div>
    );
  }

  if (!partner) {
    return (
      <div className="mx-auto max-w-xl px-5 py-20 sm:py-24">
        <p className="text-body text-secondary font-light">Loading…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-5 py-20 sm:py-24">
      <div className="opacity-0-start animate-fade-up">
        <p className="text-xs font-medium uppercase tracking-wider text-secondary">
          Partner
        </p>
        <h1 className="font-display mt-2 text-3xl font-semibold tracking-tight text-primary">
          {partner.name}
        </h1>
        <p className="mt-4 text-body text-secondary font-light leading-relaxed">
          Use your return rewards toward purchases here — amount is deducted
          from your in-app balance.
        </p>
      </div>

      {!user ? (
        <div className="glass-panel mt-10 p-8 opacity-0-start animate-fade-up delay-1">
          <p className="text-body text-secondary font-light leading-relaxed">
            Sign in to see your balance and pay with rewards.
          </p>
          <Link
            to="/login"
            className="btn-gradient mt-6 inline-block px-6 py-2.5 text-sm"
          >
            Sign in
          </Link>
        </div>
      ) : (
        <div className="glass-panel mt-10 space-y-6 p-8 opacity-0-start animate-fade-up delay-1">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-secondary">
              Your reward balance
            </p>
            <p className="mt-2 font-display text-2xl font-semibold text-primary">
              {usdc(balanceMicro)} USDC
            </p>
          </div>

          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-secondary">
              Amount (USDC)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              className="input-dark mt-2 w-full font-mono text-sm"
              placeholder="1.00"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {["0.50", "1.00", "5.00"].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setAmountStr(v)}
                  className="rounded-lg border border-white/[0.1] px-3 py-1.5 text-xs text-secondary transition hover:border-violet-500/30 hover:text-primary"
                >
                  {v}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setAmountStr(usdc(balanceMicro))}
                disabled={balanceMicro <= 0}
                className="rounded-lg border border-white/[0.1] px-3 py-1.5 text-xs text-secondary transition hover:border-violet-500/30 hover:text-primary disabled:opacity-40"
              >
                Max
              </button>
            </div>
          </div>

          {formErr && (
            <p className="text-sm text-red-300/90">{formErr}</p>
          )}
          {okMsg && (
            <p className="text-sm text-emerald-200/90">{okMsg}</p>
          )}

          <button
            type="button"
            onClick={() => void payWithRewards()}
            disabled={submitting || balanceMicro <= 0}
            className="btn-gradient w-full py-3 disabled:opacity-40"
          >
            {submitting ? "Processing…" : "Pay with rewards"}
          </button>
        </div>
      )}

      <Link
        to="/"
        className="mt-10 inline-block text-sm text-violet-300/90 underline-offset-4 hover:underline"
      >
        ← All partners
      </Link>
    </div>
  );
}
