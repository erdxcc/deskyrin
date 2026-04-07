import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PublicKey, Transaction } from "@solana/web3.js";
import { api } from "../api/client";
import type { StakePosition } from "../api/types";
import { useAuth } from "../context/AuthContext";
import bs58 from "bs58";
import {
  ata,
  buildClaimIx,
  buildFaucetAcIx,
  buildStakeIx,
  deskyrinConfigPda,
  fetchDeskyrinConfig,
  fetchMintDecimals,
  fetchStake,
  getConnection,
  programAuthorityPda,
  stakePositionPda,
} from "../lib/chainStaking";

const LOCK_DAYS = [7, 14, 30, 60, 90] as const;
const MULT: Record<(typeof LOCK_DAYS)[number], string> = {
  7: "1.10×",
  14: "1.25×",
  30: "1.50×",
  60: "2.00×",
  90: "2.75×",
};

/** Devnet faucet: whole AC per button press (raw amount derived from mint decimals). */
const FAUCET_AC_UNITS = 10;

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function trackedKey(wallet: string) {
  return `deskyrin_stakes_${wallet}`;
}

function errMsg(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === "string") return e;
  if (e && typeof e === "object") {
    const maybe = e as { message?: string; errorMessage?: string };
    if (typeof maybe.message === "string") return maybe.message;
    if (typeof maybe.errorMessage === "string") return maybe.errorMessage;
  }
  return "Unexpected error";
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
  const [onChainAc, setOnChainAc] = useState<number | null>(null);
  const [faucetBusy, setFaucetBusy] = useState(false);
  const [faucetErr, setFaucetErr] = useState<string | null>(null);

  const phantom = useMemo(() => {
    const w = window as unknown as { solana?: any };
    return w.solana ?? null;
  }, []);

  const loadStakes = useCallback(async () => {
    if (!user?.walletPublicKey) {
      setStakes([]);
      return;
    }
    try {
      const wallet = new PublicKey(user.walletPublicKey);
      const raw = localStorage.getItem(trackedKey(wallet.toBase58()));
      const tracked = raw
        ? (JSON.parse(raw) as Array<{ stakeIdx: string; lockDays: number; createdAt: string }>)
        : [];
      const conn = getConnection();
      const cfg = await fetchDeskyrinConfig(conn);
      const decimals = await fetchMintDecimals(conn, cfg.ptMint);
      const now = Date.now();
      const out: StakePosition[] = [];
      for (const t of tracked) {
        const idx = BigInt(t.stakeIdx);
        const s = await fetchStake(conn, wallet, idx);
        if (!s) continue;
        const claimed = Number(s.claimedPtBase) / 10 ** decimals;
        const total = Number(s.totalPtBase) / 10 ** decimals;
        const startMs = Number(s.startTs) * 1000;
        const matMs = Number(s.maturityTs) * 1000;
        const vested =
          now >= matMs
            ? total
            : now <= startMs
              ? 0
              : (total * (now - startMs)) / Math.max(1, matMs - startMs);
        const claimable = Math.max(0, vested - claimed);
        out.push({
          id: s.stakeIdx.toString(),
          stakeIdx: Number(s.stakeIdx),
          acAmount: Number(s.acAmountBase) / 10 ** decimals,
          lockDays: s.lockDays,
          startedAt: new Date(startMs).toISOString(),
          maturityAt: new Date(matMs).toISOString(),
          totalPtEntitled: total,
          claimedPt: claimed,
          claimablePtNow: claimable,
          fullyVested: now >= matMs,
        });
      }
      setStakes(out.sort((a, b) => b.stakeIdx - a.stakeIdx));
      setStakesErr(null);
    } catch {
      setStakesErr("Could not load on-chain stakes.");
      setStakes([]);
    }
  }, [user?.walletPublicKey]);

  const refreshOnChainAc = useCallback(async () => {
    if (!user?.walletPublicKey || user.walletCustodial) {
      setOnChainAc(null);
      return;
    }
    try {
      const conn = getConnection();
      const cfg = await fetchDeskyrinConfig(conn);
      const walletPk = new PublicKey(user.walletPublicKey);
      const userAcAta = ata(walletPk, cfg.acMint);
      const bal = await conn.getTokenAccountBalance(userAcAta);
      const ui = bal.value.uiAmount ?? Number(bal.value.amount) / 10 ** bal.value.decimals;
      setOnChainAc(ui);
    } catch {
      setOnChainAc(0);
    }
  }, [user?.walletPublicKey, user?.walletCustodial]);

  useEffect(() => {
    void refreshOnChainAc();
  }, [refreshOnChainAc]);

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
  const displayedAc =
    user.walletPublicKey && !user.walletCustodial && onChainAc !== null ? onChainAc : ac;
  const canStakeOnChain =
    !!user.walletPublicKey &&
    !user.walletCustodial &&
    onChainAc !== null &&
    onChainAc > 0;

  async function connectAndLinkWallet() {
    if (!token) return;
    setWalletErr(null);
    setWalletOk(null);
    if (!phantom || !phantom.isPhantom) {
      setWalletErr("Phantom not found. Install it or create a custodial wallet.");
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
      await refreshOnChainAc();
      setWalletOk("Wallet connected.");
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

  async function onFaucetAc() {
    const walletPublicKey = user?.walletPublicKey;
    const walletCustodial = user?.walletCustodial;
    setFaucetErr(null);
    setStakeOk(null);
    if (!walletPublicKey || walletCustodial) {
      setFaucetErr("Connect an external wallet.");
      return;
    }
    if (!phantom || !phantom.isPhantom) {
      setFaucetErr("Phantom not found.");
      return;
    }
    setFaucetBusy(true);
    try {
      if (!phantom.isConnected) await phantom.connect();
      const connectedPk = phantom.publicKey?.toString?.();
      if (connectedPk && connectedPk !== walletPublicKey) {
        throw new Error("Wallet mismatch: switch Phantom account and reconnect.");
      }
      const walletPk = new PublicKey(walletPublicKey);
      const conn = getConnection();
      const lamports = await conn.getBalance(walletPk, "confirmed");
      if (lamports < 2_000_000) {
        throw new Error("Not enough SOL for network fee/ATA rent. Keep at least ~0.002 SOL.");
      }
      const cfg = await fetchDeskyrinConfig(conn);
      const decimals = await fetchMintDecimals(conn, cfg.acMint);
      const amountRaw = BigInt(Math.floor(FAUCET_AC_UNITS * 10 ** decimals));
      const userAcAta = ata(walletPk, cfg.acMint);
      const ix = buildFaucetAcIx({
        user: walletPk,
        amountRaw,
        deskyrinConfig: deskyrinConfigPda(),
        acMint: cfg.acMint,
        userAcAta,
        programAuthority: programAuthorityPda(),
      });
      const tx = new Transaction().add(ix);
      const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = walletPk;
      const sig = await phantom.signAndSendTransaction(tx);
      await conn.confirmTransaction(
        { signature: sig.signature, blockhash, lastValidBlockHeight },
        "confirmed"
      );
      await refreshOnChainAc();
      setStakeOk(`Minted ${FAUCET_AC_UNITS} AC (wallet).`);
    } catch (e: unknown) {
      setFaucetErr(errMsg(e));
    } finally {
      setFaucetBusy(false);
    }
  }

  async function onStake() {
    if (!token) return;
    const walletPublicKey = user?.walletPublicKey;
    const walletCustodial = user?.walletCustodial;
    setStakeErr(null);
    setStakeOk(null);
    const n = Number.parseInt(stakeStr.replace(/\s/g, ""), 10);
    if (!Number.isFinite(n) || n <= 0) {
      setStakeErr("Enter a whole number of AC.");
      return;
    }
    if (!walletPublicKey) {
      setStakeErr("Connect external wallet first.");
      return;
    }
    if (walletCustodial) {
      setStakeErr("Staking requires a real external wallet, not custodial.");
      return;
    }
    setStaking(true);
    try {
      if (!phantom?.isConnected) {
        await phantom.connect();
      }
      const walletPk = new PublicKey(walletPublicKey);
      const conn = getConnection();
      const cfg = await fetchDeskyrinConfig(conn);
      const decimals = await fetchMintDecimals(conn, cfg.acMint);
      const amountBase = BigInt(Math.floor(n * 10 ** decimals));
      if (amountBase <= 0n) throw new Error("Amount too small for token decimals.");
      const userAcAta = ata(walletPk, cfg.acMint);
      const bal = await conn.getTokenAccountBalance(userAcAta);
      const currentBase = BigInt(bal.value.amount);
      if (currentBase < amountBase) {
        setStakeErr("Not enough real AC tokens in connected wallet.");
        return;
      }
      const stakeIdx = BigInt(Date.now());
      const stakePda = stakePositionPda(walletPk, stakeIdx);
      const ix = buildStakeIx({
        user: walletPk,
        stakeIdx,
        amountBase,
        lockDays,
        deskyrinConfig: deskyrinConfigPda(),
        stakePosition: stakePda,
        userAcAta,
        vaultAc: cfg.vaultAc,
      });
      const tx = new Transaction().add(ix);
      const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = walletPk;
      const sig = await phantom.signAndSendTransaction(tx);
      await conn.confirmTransaction(
        { signature: sig.signature, blockhash, lastValidBlockHeight },
        "confirmed"
      );
      const key = trackedKey(walletPk.toBase58());
      const cur = localStorage.getItem(key);
      const arr = cur
        ? (JSON.parse(cur) as Array<{ stakeIdx: string; lockDays: number; createdAt: string }>)
        : [];
      arr.push({ stakeIdx: stakeIdx.toString(), lockDays, createdAt: new Date().toISOString() });
      localStorage.setItem(key, JSON.stringify(arr));
      await loadStakes();
      await refreshOnChainAc();
      setStakeOk(`Stake submitted: ${n} AC for ${lockDays}d.`);
      setStakeStr("0");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Stake failed";
      setStakeErr(msg);
    } finally {
      setStaking(false);
    }
  }

  async function onClaim(stakeId: string) {
    const walletPublicKey = user?.walletPublicKey;
    const walletCustodial = user?.walletCustodial;
    if (!token || !walletPublicKey) return;
    setStakeErr(null);
    setStakeOk(null);
    setClaimingId(stakeId);
    try {
      if (walletCustodial) {
        throw new Error("Claim requires external connected wallet.");
      }
      if (!phantom?.isConnected) {
        await phantom.connect();
      }
      const walletPk = new PublicKey(walletPublicKey);
      const conn = getConnection();
      const cfg = await fetchDeskyrinConfig(conn);
      const stakeIdx = BigInt(stakeId);
      const stakePda = stakePositionPda(walletPk, stakeIdx);
      const userPtAta = ata(walletPk, cfg.ptMint);
      const ix = buildClaimIx({
        user: walletPk,
        stakeIdx,
        deskyrinConfig: deskyrinConfigPda(),
        stakePosition: stakePda,
        userPtAta,
        ptMint: cfg.ptMint,
        programAuthority: programAuthorityPda(),
      });
      const tx = new Transaction().add(ix);
      const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = walletPk;
      const sig = await phantom.signAndSendTransaction(tx);
      await conn.confirmTransaction(
        { signature: sig.signature, blockhash, lastValidBlockHeight },
        "confirmed"
      );
      await loadStakes();
      setStakeOk("Claim confirmed.");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Claim failed";
      setStakeErr(msg);
    } finally {
      setClaimingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-20 sm:py-24">
      <div className="grid gap-4 opacity-0-start animate-fade-up sm:grid-cols-[1.35fr,1fr]">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-primary">
            Dashboard
          </h1>
          <p className="mt-2 text-body text-secondary font-light">{user.email}</p>
        </div>
        <aside className="rounded-2xl border border-violet-500/20 bg-violet-500/[0.07] p-5 shadow-[0_20px_60px_-35px_rgba(124,58,237,0.5)]">
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-violet-200/80">
            Info
          </p>
          <p className="mt-3 text-sm leading-relaxed text-secondary">
            AC is earned from tasks. Stake AC to vest PT. PT is liquid.
          </p>
          <p className="mt-3 text-xs text-violet-200/85">
            Longer lock period gives a higher PT cap.
          </p>
        </aside>
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
                {user.walletCustodial ? "Custodial wallet" : "External wallet"}
              </p>
            </>
          ) : (
            <>
              <p className="mt-4 text-body text-secondary font-light leading-relaxed">
                Connect an external wallet to stake and claim on-chain.
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
              {displayedAc} <span className="text-base font-medium text-secondary">AC</span>
            </p>
            {user.walletPublicKey && !user.walletCustodial && (
              <div className="mt-4 space-y-3 border-t border-white/[0.06] pt-4">
                <p className="text-xs text-secondary">
                  Wallet (SPL):{" "}
                  <span className="font-mono text-primary">
                    {onChainAc === null ? "…" : onChainAc}
                  </span>{" "}
                  AC
                </p>
                <button
                  type="button"
                  disabled={faucetBusy}
                  onClick={() => void onFaucetAc()}
                  className="btn-outline w-full border-violet-400/30 py-2.5 text-xs text-violet-100 disabled:opacity-40 sm:w-auto sm:px-6"
                >
                  {faucetBusy ? "Minting…" : `Mint ${FAUCET_AC_UNITS} test AC (on-chain)`}
                </button>
                {faucetErr && (
                  <p className="text-xs text-red-300/90">{faucetErr}</p>
                )}
              </div>
            )}
          </div>
          <div className="glass-panel p-8 opacity-0-start animate-fade-up delay-1">
            <h2 className="text-xs font-medium uppercase tracking-wider text-secondary">
              PT — Protocol Tokens
            </h2>
            <p className="mt-4 font-display text-3xl font-semibold tracking-tight text-primary">
              {pt} <span className="text-base font-medium text-secondary">PT</span>
            </p>
          </div>
        </div>

        <div className="glass-panel border border-violet-500/15 bg-violet-500/[0.04] p-8 opacity-0-start animate-fade-up delay-2">
          <h2 className="font-display text-base font-semibold text-primary">
            Stake AC → vest PT
          </h2>
          <p className="mt-2 text-body text-secondary font-light text-sm">
            PT unlocks linearly during lock period. No instant swap.
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
            disabled={staking || !canStakeOnChain}
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
              No active stakes.
            </p>
          )}
          <ul className="mt-5 space-y-4">
            {stakes.map((s) => (
              <li
                key={s.id}
                className="relative overflow-hidden rounded-2xl border border-white/[0.09] bg-gradient-to-br from-white/[0.035] to-white/[0.015] p-5 text-sm shadow-[0_20px_60px_-40px_rgba(99,102,241,0.5)]"
              >
                <div
                  className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-violet-300/80 to-indigo-400/70"
                  aria-hidden
                />
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-[11px] text-secondary/90">
                      Stake #{s.stakeIdx} · {s.lockDays}d · {MULT[s.lockDays as keyof typeof MULT]} cap
                    </p>
                    <p className="mt-2 text-secondary">
                      Locked: <span className="font-medium text-primary">{s.acAmount} AC</span>
                      {" · "}
                      PT cap: <span className="font-medium text-primary">{s.totalPtEntitled}</span>
                    </p>
                    <p className="mt-1 text-secondary">
                      Maturity: {fmtDate(s.maturityAt)}
                    </p>
                    <p className="mt-2 text-primary">
                      Claimable now:{" "}
                      <span className="font-semibold text-violet-200">{s.claimablePtNow}</span> PT
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={
                      claimingId === s.id || s.claimablePtNow <= 0
                    }
                    onClick={() => void onClaim(s.id)}
                    className="btn-outline shrink-0 border-violet-400/30 px-4 py-2 text-xs text-violet-100 disabled:opacity-40"
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
            Wallet
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
              No wallet linked.
            </p>
          )}
        </div>

        <div className="glass-panel border-dashed border-violet-500/20 bg-violet-500/[0.04] p-8 opacity-0-start animate-fade-up delay-3">
          <h2 className="font-display text-base font-semibold text-primary">
            Next
          </h2>
          <p className="mt-3 text-body text-secondary font-light leading-relaxed">
            Earn AC in campaigns, then stake or spend tokens at partners.
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
