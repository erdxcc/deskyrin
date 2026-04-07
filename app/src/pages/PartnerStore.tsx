import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { PublicPartner } from "../api/types";
import { useAuth } from "../context/AuthContext";

function parseAmount(raw: string): number | null {
  const n = Number.parseInt(raw.replace(/\s/g, ""), 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function PartnerStore() {
  const { partnerId = "" } = useParams<{ partnerId: string }>();
  const { user, token, refreshUser } = useAuth();
  const [partner, setPartner] = useState<PublicPartner | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [ptStr, setPtStr] = useState("10");
  const [acStr, setAcStr] = useState("5");
  const [submittingPt, setSubmittingPt] = useState(false);
  const [submittingAc, setSubmittingAc] = useState(false);
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

  const ptBal = user?.ptBalance ?? 0;
  const acBal = user?.acBalance ?? 0;

  async function payWithPt() {
    if (!token || !partner) return;
    setFormErr(null);
    setOkMsg(null);
    const amt = parseAmount(ptStr.trim());
    if (amt == null) {
      setFormErr("Enter a whole number of PT.");
      return;
    }
    if (amt > ptBal) {
      setFormErr("Amount exceeds your PT balance.");
      return;
    }
    setSubmittingPt(true);
    try {
      await api.redeemRewards(token, {
        partnerId: partner.id,
        amountPt: amt,
      });
      await refreshUser();
      setOkMsg(`Paid ${amt} PT at ${partner.name}.`);
      setPtStr("0");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Payment failed";
      if (msg.includes("INSUFFICIENT_BALANCE")) {
        setFormErr("Insufficient balance.");
      } else {
        setFormErr(msg);
      }
    } finally {
      setSubmittingPt(false);
    }
  }

  async function payWithAc() {
    if (!token || !partner) return;
    setFormErr(null);
    setOkMsg(null);
    const amt = parseAmount(acStr.trim());
    if (amt == null) {
      setFormErr("Enter a whole number of AC.");
      return;
    }
    if (amt > acBal) {
      setFormErr("Amount exceeds your AC balance.");
      return;
    }
    setSubmittingAc(true);
    try {
      await api.redeemAc(token, {
        partnerId: partner.id,
        amountAc: amt,
      });
      await refreshUser();
      setOkMsg(`Paid ${amt} AC at ${partner.name} (partner-only).`);
      setAcStr("0");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Payment failed";
      if (msg.includes("INSUFFICIENT_BALANCE")) {
        setFormErr("Insufficient balance.");
      } else {
        setFormErr(msg);
      }
    } finally {
      setSubmittingAc(false);
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
          Pay with Protocol Tokens (liquid) or Action Tokens (partner-only, not
          transferable on a secondary market).
        </p>
      </div>

      {!user ? (
        <div className="glass-panel mt-10 p-8 opacity-0-start animate-fade-up delay-1">
          <p className="text-body text-secondary font-light leading-relaxed">
            Sign in to see balances and pay.
          </p>
          <Link
            to="/login"
            className="btn-gradient mt-6 inline-block px-6 py-2.5 text-sm"
          >
            Sign in
          </Link>
        </div>
      ) : (
        <div className="mt-10 space-y-8">
          <div className="glass-panel space-y-6 p-8 opacity-0-start animate-fade-up delay-1">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-secondary">
                PT balance
              </p>
              <p className="mt-2 font-display text-2xl font-semibold text-primary">
                {ptBal} PT
              </p>
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-secondary">
                Amount (PT)
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={ptStr}
                onChange={(e) => setPtStr(e.target.value)}
                className="input-dark mt-2 w-full font-mono text-sm"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                {["5", "10", "25"].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setPtStr(v)}
                    className="rounded-lg border border-white/[0.1] px-3 py-1.5 text-xs text-secondary transition hover:border-violet-500/30 hover:text-primary"
                  >
                    {v}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setPtStr(String(ptBal))}
                  disabled={ptBal <= 0}
                  className="rounded-lg border border-white/[0.1] px-3 py-1.5 text-xs text-secondary transition hover:border-violet-500/30 hover:text-primary disabled:opacity-40"
                >
                  Max
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void payWithPt()}
              disabled={submittingPt || ptBal <= 0}
              className="btn-gradient w-full py-3 disabled:opacity-40"
            >
              {submittingPt ? "Processing…" : "Pay with PT"}
            </button>
          </div>

          <div className="glass-panel space-y-6 border border-amber-500/15 bg-amber-500/[0.04] p-8 opacity-0-start animate-fade-up delay-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-secondary">
                AC balance (partner spend only)
              </p>
              <p className="mt-2 font-display text-2xl font-semibold text-primary">
                {acBal} AC
              </p>
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-secondary">
                Amount (AC)
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={acStr}
                onChange={(e) => setAcStr(e.target.value)}
                className="input-dark mt-2 w-full font-mono text-sm"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                {["5", "10", "25"].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setAcStr(v)}
                    className="rounded-lg border border-white/[0.1] px-3 py-1.5 text-xs text-secondary transition hover:border-violet-500/30 hover:text-primary"
                  >
                    {v}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setAcStr(String(acBal))}
                  disabled={acBal <= 0}
                  className="rounded-lg border border-white/[0.1] px-3 py-1.5 text-xs text-secondary transition hover:border-violet-500/30 hover:text-primary disabled:opacity-40"
                >
                  Max
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void payWithAc()}
              disabled={submittingAc || acBal <= 0}
              className="btn-outline w-full border-amber-500/30 py-3 text-amber-100/90 hover:border-amber-400/40 disabled:opacity-40"
            >
              {submittingAc ? "Processing…" : "Pay with AC"}
            </button>
          </div>

          {formErr && (
            <p className="text-sm text-red-300/90">{formErr}</p>
          )}
          {okMsg && (
            <p className="text-sm text-emerald-200/90">{okMsg}</p>
          )}
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
