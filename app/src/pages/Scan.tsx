import { useCallback, useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { QrPublic } from "../api/types";
import { QrScanModal } from "../components/QrScanModal";
import { useAuth } from "../context/AuthContext";
import { parseQrPayload } from "../lib/parseQrPayload";

function usdc(micro: number) {
  return (micro / 1_000_000).toFixed(2);
}

export function Scan() {
  const { token, user, refreshUser } = useAuth();
  const [bottleId, setBottleId] = useState("");
  const [preview, setPreview] = useState<QrPublic | null>(null);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<{
    walletPublicKey: string;
    qr: QrPublic;
    hint?: string;
    onChainMint: boolean;
    showPayout: boolean;
  } | null>(null);
  const [scanErr, setScanErr] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [activating, setActivating] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activationAttempted = useRef<Set<string>>(new Set());

  const [recycleDemoLoading, setRecycleDemoLoading] = useState(false);
  const [recycleDemoErr, setRecycleDemoErr] = useState<string | null>(null);
  const [recycleDemoOk, setRecycleDemoOk] = useState(false);

  const fetchPreview = useCallback(async (id: string) => {
    setPreviewErr(null);
    setLoadingPreview(true);
    try {
      const q = await api.getQr(id);
      setPreview(q);
    } catch (e: unknown) {
      setPreview(null);
      setPreviewErr(e instanceof Error ? e.message : "Not found");
    } finally {
      setLoadingPreview(false);
    }
  }, []);

  const runActivation = useCallback(
    async (id: string) => {
      if (!token) return;
      setScanErr(null);
      setActivating(true);
      try {
        const r = await api.firstScan(token, id);
        setScanResult({
          walletPublicKey: r.user.walletPublicKey!,
          qr: r.qr,
          hint: r.hint,
          onChainMint: r.onChainMint ?? false,
          showPayout: r.walletCreatedThisSession === true,
        });
        await refreshUser();
        await fetchPreview(id);
      } catch (e: unknown) {
        setScanErr(e instanceof Error ? e.message : "Activation failed");
        activationAttempted.current.delete(id);
      } finally {
        setActivating(false);
      }
    },
    [token, refreshUser, fetchPreview]
  );

  useEffect(() => {
    const id = bottleId.trim();
    if (!token || !preview || preview.status !== "registered" || !id) return;
    if (activationAttempted.current.has(id)) return;
    activationAttempted.current.add(id);
    void runActivation(id);
  }, [token, preview?.status, preview?.bottleId, bottleId, runActivation]);

  const applyDecoded = useCallback(
    async (raw: string) => {
      const id = parseQrPayload(raw);
      if (!id) {
        setPreviewErr("Could not read a bottle id from this QR.");
        return;
      }
      setBottleId(id);
      setScanResult(null);
      setRecycleDemoOk(false);
      setRecycleDemoErr(null);
      activationAttempted.current.delete(id);
      await fetchPreview(id);
    },
    [fetchPreview]
  );

  const loadPreview = useCallback(async () => {
    const id = bottleId.trim();
    if (!id) return;
    activationAttempted.current.delete(id);
    await fetchPreview(id);
  }, [bottleId, fetchPreview]);

  async function onImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const hostId = `qr-file-${Date.now()}`;
    const host = document.createElement("div");
    host.id = hostId;
    host.style.display = "none";
    document.body.appendChild(host);
    setScanErr(null);
    try {
      const qr = new Html5Qrcode(hostId, { verbose: false });
      const text = await qr.scanFile(file, false);
      await qr.clear();
      await applyDecoded(text);
    } catch (err: unknown) {
      setPreview(null);
      setPreviewErr(
        err instanceof Error ? err.message : "No QR found in this image."
      );
    } finally {
      host.remove();
    }
  }

  function clearSelection() {
    setBottleId("");
    setPreview(null);
    setPreviewErr(null);
    setScanResult(null);
    setScanErr(null);
    setRecycleDemoOk(false);
    setRecycleDemoErr(null);
    activationAttempted.current.clear();
  }

  const canDemoRecycle =
    Boolean(bottleId.trim() && user?.id) &&
    (scanResult?.qr.status === "minted" ||
      (preview?.status === "minted" &&
        preview.assignedUserId === user?.id));

  async function simulateReturnDesk() {
    const id = bottleId.trim();
    if (!id) return;
    setRecycleDemoErr(null);
    setRecycleDemoOk(false);
    setRecycleDemoLoading(true);
    try {
      const { qr } = await api.demoRecycle(id);
      setScanResult((prev) =>
        prev
          ? { ...prev, qr, showPayout: false }
          : {
              walletPublicKey: user?.walletPublicKey ?? "",
              qr,
              onChainMint: false,
              showPayout: false,
            }
      );
      setPreview(qr);
      await refreshUser();
      setRecycleDemoOk(true);
    } catch (e: unknown) {
      setRecycleDemoErr(e instanceof Error ? e.message : "Recycle failed");
    } finally {
      setRecycleDemoLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl px-5 py-20 sm:py-24">
      <QrScanModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onDecoded={(text) => void applyDecoded(text)}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onImageFile}
      />

      <div className="opacity-0-start animate-fade-up">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-primary">
          Scan packaging QR
        </h1>
        <p className="mt-4 text-body text-secondary font-light leading-relaxed">
          Scan or enter the code on the label. If you are signed in and the
          bottle is available, it links to your account automatically.
        </p>
        {user ? (
          <p className="mt-6 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-secondary opacity-0-start animate-fade-up delay-1">
            <span className="text-secondary">Reward balance:</span>{" "}
            <span className="font-medium text-primary">
              {usdc(user.rewardBalanceUsdcMicro ?? 0)} USDC
            </span>
          </p>
        ) : null}
      </div>

      <div className="glass-panel mt-12 space-y-5 p-8 opacity-0-start animate-fade-up delay-1">
        {bottleId.trim() ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-secondary">
              Scanned id:{" "}
              <span className="font-mono text-xs text-primary">
                {bottleId.trim()}
              </span>
            </p>
            <button
              type="button"
              onClick={clearSelection}
              className="text-xs text-violet-300/90 underline-offset-4 hover:underline"
            >
              Clear
            </button>
          </div>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => setCameraOpen(true)}
            className="btn-gradient flex-1 py-3.5"
          >
            Scan with camera
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="btn-outline flex-1 py-3.5"
          >
            Scan from image
          </button>
        </div>

        <details className="group rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
          <summary className="cursor-pointer list-none text-sm font-medium text-secondary transition group-open:text-primary [&::-webkit-details-marker]:hidden">
            <span className="text-violet-300/80">▸</span>             Enter code manually
          </summary>
          <div className="mt-4 space-y-3 pb-2">
            <input
              value={bottleId}
              onChange={(e) => setBottleId(e.target.value)}
              placeholder="BOTTLE_001"
              className="input-dark font-mono text-sm"
            />
            <button
              type="button"
              onClick={() => void loadPreview()}
              disabled={loadingPreview || !bottleId.trim()}
              className="btn-ghost w-full py-2.5 disabled:opacity-40 disabled:hover:scale-100"
            >
              {loadingPreview ? "Loading…" : "Load product"}
            </button>
          </div>
        </details>
      </div>

      {previewErr && (
        <p className="mt-6 text-sm text-red-300/90">{previewErr}</p>
      )}

      {preview && (
        <div className="glass-panel-interactive mt-6 p-6 text-sm opacity-0-start animate-fade-in">
          <p className="font-medium text-primary">
            {preview.productName ?? "Product"}
          </p>
          <p className="mt-2 text-secondary">
            Status:{" "}
            <span className="text-violet-300/90">{preview.status}</span>
          </p>
          <p className="mt-2 text-secondary">
            Return reward:{" "}
            <span className="font-medium text-primary">
              {usdc(preview.rewardUsdcMicro)} USDC
            </span>
          </p>
          {preview.bottleMintPubkey && (
            <p className="mt-3 font-mono text-[11px] leading-relaxed text-secondary break-all">
              Mint: {preview.bottleMintPubkey}
            </p>
          )}
          {preview.status === "registered" && !token && (
            <p className="mt-4 text-body text-amber-200/85 font-light">
              <Link
                to="/login"
                className="text-violet-300/90 underline-offset-4 hover:underline"
              >
                Log in
              </Link>{" "}
              to link this bottle to your account.
            </p>
          )}
          {preview.status === "registered" && token && activating && (
            <p className="mt-4 text-sm text-secondary">Linking to your account…</p>
          )}
          {scanResult &&
            preview &&
            scanResult.qr.bottleId === preview.bottleId &&
            scanResult.hint && (
              <p className="mt-4 text-body text-secondary/90 font-light leading-relaxed border-t border-white/[0.06] pt-4">
                {scanResult.onChainMint ? (
                  <span className="text-violet-300/85">On-chain</span>
                ) : (
                  <span>In-app record</span>
                )}
                : {scanResult.hint}
              </p>
            )}
        </div>
      )}

      {scanErr && (
        <p className="mt-6 text-sm text-red-300/90">{scanErr}</p>
      )}

      {scanResult?.showPayout && scanResult.walletPublicKey ? (
        <div className="glass-panel mt-10 border-violet-500/20 bg-violet-500/[0.06] p-6 opacity-0-start animate-fade-in">
          <p className="text-xs font-medium uppercase tracking-wider text-secondary">
            Payout address (first time only)
          </p>
          <p className="mt-3 font-mono text-xs break-all text-primary/95">
            {scanResult.walletPublicKey}
          </p>
          <p className="mt-4 text-body text-secondary font-light leading-relaxed">
            Your custodial Solana wallet — return rewards go here. You can always
            copy it from the{" "}
            <Link
              to="/app"
              className="text-violet-300/90 underline-offset-4 hover:underline"
            >
              Dashboard
            </Link>
            .
          </p>
        </div>
      ) : null}

      {canDemoRecycle && (
        <div className="glass-panel mt-8 border-dashed border-amber-500/25 bg-amber-500/[0.05] p-6 opacity-0-start animate-fade-in">
          <p className="text-xs font-medium uppercase tracking-wider text-amber-200/80">
            Demo — imitate return-station scan
          </p>
          <button
            type="button"
            onClick={() => void simulateReturnDesk()}
            disabled={recycleDemoLoading || !bottleId.trim()}
            className="btn-outline mt-5 w-full py-3 disabled:opacity-40"
          >
            {recycleDemoLoading
              ? "Processing…"
              : "Simulate scanner at return point"}
          </button>
          {recycleDemoErr && (
            <p className="mt-3 text-sm text-red-300/90">{recycleDemoErr}</p>
          )}
          {recycleDemoOk && user && (
            <p className="mt-4 text-sm text-emerald-200/90">
              Utilized — your reward balance is now{" "}
              <span className="font-medium text-primary">
                {usdc(user.rewardBalanceUsdcMicro ?? 0)} USDC
              </span>
              . See{" "}
              <Link to="/app" className="text-violet-300/90 underline-offset-4 hover:underline">
                Dashboard
              </Link>
              .
            </p>
          )}
        </div>
      )}

      {recycleDemoOk && scanResult?.qr.status === "utilized" && !user ? (
        <p className="mt-6 text-center text-sm text-emerald-200/90">
          Bottle marked utilized — sign in again to see your balance.
        </p>
      ) : null}
    </div>
  );
}
