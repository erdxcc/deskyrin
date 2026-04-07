import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { StakePosition } from "../api/types";
import { useAuth } from "../context/AuthContext";
import bs58 from "bs58";

const LOCK_DAYS = [7, 14, 30, 60, 90] as const;
const MULT: Record<(typeof LOCK_DAYS)[number], string> = {
  7: "1.10×",
  14: "1.25×",
  30: "1.50×",
  60: "2.00×",
  90: "2.75×",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function Dashboard() {
  const { user, token, refreshUser } = useAuth();
  const [stakeStr, setStakeStr] = useState("10");
  const [lockDays, setLockDays] = useState<number>(30);
  const [staking, setStaking] = useState(false);
  const [stakeErr, setStakeErr] = useState<string | null>(null);
  const [stakeOk, setStakeOk] = useState<string | null>(null);
  const [stakes, setStakes] = useState<StakePosition[]>([]);
  const [stakesErr, setStakesErr] = useState<string | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [walletErr, setWalletErr] = useState<string | null>(null);
  const [walletOk, setWalletOk] = useState<string | null>(null);
  const [connectingWallet, setConnectingWallet] = useState(false);
  const [creatingCustodial, setCreatingCustodial] = useState(false);

  const phantom = useMemo(() => {
    const w = window as unknown as { solana?: any };
    return w.solana ?? null;
  }, []);

  const loadStakes = useCallback(async () => {
    if (!token) return;
    try {
      const r = await api.listStakes(token);
      setStakes(r.stakes);
      setStakesErr(null);
    } catch {
      setStakesErr("Could not load stakes.");
      setStakes([]);
    }
  }, [token]);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  useEffect(() => {
    void loadStakes();
  }, [loadStakes]);

  if (!user) return null;

  const hasWallet = !!user.walletPublicKey;
  const ac = user.acBalance ?? 0;
  const pt = user.ptBalance ?? 0;

  async function connectAndLinkWallet() {
    if (!token) return;
    setWalletErr(null);
    setWalletOk(null);
    if (!phantom || !phantom.isPhantom) {
      setWalletErr("Phantom not found. Install Phantom or create a custodial wallet below.");
      return;
    }
    if (!phantom.signMessage) {
      setWalletErr("Wallet does not support message signing.");
      return;
    }
    setConnectingWallet(true);
    try {
      const resp = await phantom.connect();
      const pubkey = resp.publicKey?.toString?.() ?? phantom.publicKey?.toString?.();
      if (!pubkey) throw new Error("Could not read wallet public key.");
      const { nonce, message } = await api.walletChallenge(token);
      const signed = await phantom.signMessage(new TextEncoder().encode(message), "utf8");
      const sigBytes: Uint8Array =
        signed?.signature ?? signed ?? signed?.data ?? signed?.signatureBytes;
      if (!sigBytes || !(sigBytes instanceof Uint8Array)) {
        throw new Error("Could not read signature bytes.");
      }
      const signatureB58 = bs58.encode(sigBytes);
      await api.walletLink(token, { publicKey: pubkey, signatureB58, nonce });
      await refreshUser();
      setWalletOk("Wallet linked.");
    } catch (e: unknown) {
      setWalletErr(e instanceof Error ? e.message : "Wallet connect failed");
    } finally {
      setConnectingWallet(false);
    }
  }

  async function createCustodialWallet() {
    if (!token) return;
    setWalletErr(null);
    setWalletOk(null);
    setCreatingCustodial(true);
    try {
      await api.walletCreateCustodial(token);
      await refreshUser();
      setWalletOk("Custodial wallet created.");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Create failed";
      setWalletErr(msg);
    } finally {
      setCreatingCustodial(false);
    }
  }

  async function onStake() {
    if (!token) return;
    setStakeErr(null);
    setStakeOk(null);
    const n = Number.parseInt(stakeStr.replace(/\s/g, ""), 10);
    if (!Number.isFinite(n) || n <= 0) {
      setStakeErr("Enter a whole number of AC.");
      return;
    }
    if (n > ac) {
      setStakeErr("Not enough AC.");
      return;
    }
    setStaking(true);
    try {
      const r = await api.stakeAc(token, { amountAc: n, lockDays });
      await refreshUser();
      setStakes((prev) => [r.stake, ...prev]);
      setStakeOk(
        `Locked ${n} AC for ${lockDays} days. PT vests linearly; claim anytime for accrued amount.`
      );
      setStakeStr("0");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Stake failed";
      setStakeErr(msg.includes("INSUFFICIENT") ? "Not enough AC." : msg);
    } finally {
      setStaking(false);
    }
  }

  async function onClaim(stakeId: string) {
    if (!token) return;
    setStakeErr(null);
    setStakeOk(null);
    setClaimingId(stakeId);
    try {
      const r = await api.claimStake(token, stakeId);
      await refreshUser();
      setStakes((list) =>
        list.map((s) => (s.id === stakeId ? r.stake : s))
      );
      setStakeOk(`Claimed ${r.claimedPt} PT.`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Claim failed";
      if (msg.includes("NOTHING_TO_CLAIM")) {
        setStakeErr("Nothing to claim yet.");
      } else {
        setStakeErr(msg);
      }
    } finally {
      setClaimingId(null);
    }
  }

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
            Solana wallet
          </h2>
          {user.walletPublicKey ? (
            <>
              <p className="mt-4 font-mono text-xs leading-relaxed text-primary/95 break-all">
                {user.walletPublicKey}
              </p>
              <p className="mt-3 text-sm text-secondary">
                {user.walletCustodial ? "Custodial (created in-platform)" : "External (connected)"}
              </p>
            </>
          ) : (
            <>
              <p className="mt-4 text-body text-secondary font-light leading-relaxed">
                Connect a wallet for on-chain staking and claims.
              </p>
              <button
                type="button"
                onClick={() => void connectAndLinkWallet()}
                disabled={connectingWallet}
                className="btn-gradient mt-6 w-full py-3 disabled:opacity-40 sm:w-auto sm:px-10"
              >
                {connectingWallet ? "Connecting…" : "Connect wallet"}
              </button>
              <p className="mt-4 text-sm text-secondary">
                Нет кошелька?{" "}
                <button
                  type="button"
                  onClick={() => void createCustodialWallet()}
                  disabled={creatingCustodial}
                  className="text-violet-300/90 underline-offset-4 hover:underline disabled:opacity-40"
                >
                  Создать в платформе
                </button>
              </p>
            </>
          )}
          {walletErr && <p className="mt-4 text-sm text-red-300/90">{walletErr}</p>}
          {walletOk && <p className="mt-4 text-sm text-emerald-200/90">{walletOk}</p>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="glass-panel p-8 opacity-0-start animate-fade-up delay-1">
            <h2 className="text-xs font-medium uppercase tracking-wider text-secondary">
              AC — Action Tokens
            </h2>
            <p className="mt-4 font-display text-3xl font-semibold tracking-tight text-primary">
              {ac} <span className="text-base font-medium text-secondary">AC</span>
            </p>
            <p className="mt-3 text-body text-secondary font-light text-sm leading-relaxed">
              From campaigns. Stake with a lock period for PT (vesting). Spend AC
              only at partner checkouts.
            </p>
          </div>
          <div className="glass-panel p-8 opacity-0-start animate-fade-up delay-1">
            <h2 className="text-xs font-medium uppercase tracking-wider text-secondary">
              PT — Protocol Tokens
            </h2>
            <p className="mt-4 font-display text-3xl font-semibold tracking-tight text-primary">
              {pt} <span className="text-base font-medium text-secondary">PT</span>
            </p>
            <p className="mt-3 text-body text-secondary font-light text-sm leading-relaxed">
              Claim from active stakes as they vest. Liquid — spend at partners or
              withdraw (MVP).
            </p>
          </div>
        </div>

        <div className="glass-panel border border-violet-500/15 bg-violet-500/[0.04] p-8 opacity-0-start animate-fade-up delay-2">
          <h2 className="font-display text-base font-semibold text-primary">
            Stake AC → vest PT
          </h2>
          <p className="mt-2 text-body text-secondary font-light text-sm">
            Longer lock → higher total PT at maturity (7d … 90d). No instant swap:
            PT unlocks linearly over the lock period; claim any time for accrued
            amount.
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-secondary">
                Amount (AC)
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={stakeStr}
                onChange={(e) => setStakeStr(e.target.value)}
                className="input-dark mt-2 w-full font-mono text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-secondary">
                Lock period
              </label>
              <select
                value={lockDays}
                onChange={(e) => setLockDays(Number(e.target.value))}
                className="input-dark mt-2 w-full text-sm"
              >
                {LOCK_DAYS.map((d) => (
                  <option key={d} value={d}>
                    {d} days · {MULT[d]} cap
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button
            type="button"
            disabled={staking || ac <= 0}
            onClick={() => void onStake()}
            className="btn-gradient mt-6 w-full py-3 disabled:opacity-40 sm:w-auto sm:px-10"
          >
            {staking ? "Locking…" : "Lock & start stake"}
          </button>
          {stakeErr && (
            <p className="mt-3 text-sm text-red-300/90">{stakeErr}</p>
          )}
          {stakeOk && (
            <p className="mt-3 text-sm text-emerald-200/90">{stakeOk}</p>
          )}
        </div>

        <div className="glass-panel p-8 opacity-0-start animate-fade-up delay-2">
          <h2 className="font-display text-base font-semibold text-primary">
            Active stakes
          </h2>
          {stakesErr && (
            <p className="mt-3 text-sm text-red-300/90">{stakesErr}</p>
          )}
          {!stakesErr && stakes.length === 0 && (
            <p className="mt-4 text-body text-secondary font-light text-sm">
              No stakes yet.
            </p>
          )}
          <ul className="mt-4 space-y-4">
            {stakes.map((s) => (
              <li
                key={s.id}
                className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 text-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-xs text-secondary">
                      #{s.stakeIdx} · {s.lockDays}d lock · {s.acAmount} AC
                    </p>
                    <p className="mt-1 text-secondary">
                      Maturity {fmtDate(s.maturityAt)} · total PT cap{" "}
                      {s.totalPtEntitled}
                    </p>
                    <p className="mt-1 text-primary">
                      Claimable now:{" "}
                      <span className="font-medium">{s.claimablePtNow}</span> PT
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={
                      claimingId === s.id || s.claimablePtNow <= 0
                    }
                    onClick={() => void onClaim(s.id)}
                    className="btn-outline shrink-0 px-4 py-2 text-xs disabled:opacity-40"
                  >
                    {claimingId === s.id ? "Claiming…" : "Claim PT"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="glass-panel p-8 opacity-0-start animate-fade-up delay-2">
          <h2 className="text-xs font-medium uppercase tracking-wider text-secondary">
            Payout wallet (optional)
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
              Custodial Solana address may be created by legacy flows. App balances
              are primary; on-chain mirroring uses the program in this repo.
            </p>
          )}
        </div>

        <div className="glass-panel border-dashed border-violet-500/20 bg-violet-500/[0.04] p-8 opacity-0-start animate-fade-up delay-3">
          <h2 className="font-display text-base font-semibold text-primary">
            Next step
          </h2>
          <p className="mt-3 text-body text-secondary font-light leading-relaxed">
            Earn AC from campaigns, lock for PT vesting, or spend AC/PT at partner
            pages.
          </p>
          <Link
            to="/campaigns"
            className="btn-gradient mt-6 inline-block px-6 py-2.5 text-sm"
          >
            Browse campaigns
          </Link>
        </div>
      </div>
    </div>
  );
}
