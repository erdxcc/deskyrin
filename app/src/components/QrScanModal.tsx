import { Html5Qrcode } from "html5-qrcode";
import { useEffect, useId, useRef, useState } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  onDecoded: (text: string) => void;
};

export function QrScanModal({ open, onClose, onDecoded }: Props) {
  const reactId = useId().replace(/\W/g, "");
  const regionId = `qr-live-${reactId}`;
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const onDecodedRef = useRef(onDecoded);
  const onCloseRef = useRef(onClose);
  const [camErr, setCamErr] = useState<string | null>(null);
  onDecodedRef.current = onDecoded;
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) {
      setCamErr(null);
      return;
    }

    let cancelled = false;
    const qr = new Html5Qrcode(regionId, { verbose: false });
    scannerRef.current = qr;

    void (async () => {
      try {
        const cameras = await Html5Qrcode.getCameras();
        if (cancelled) return;
        if (!cameras.length) {
          setCamErr("No camera found. Use “Scan from image” instead.");
          return;
        }
        const back = cameras.find((c) =>
          /back|rear|environment|wide/i.test(c.label)
        );
        const deviceId = back?.id ?? cameras[0].id;

        await qr.start(
          deviceId,
          { fps: 10, qrbox: { width: 280, height: 280 } },
          (decodedText) => {
            if (cancelled) return;
            onDecodedRef.current(decodedText);
            void qr
              .stop()
              .then(() => qr.clear())
              .catch(() => {});
            onCloseRef.current();
          },
          () => {}
        );
      } catch (e: unknown) {
        if (!cancelled) {
          setCamErr(
            e instanceof Error ? e.message : "Could not start the camera."
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      const s = scannerRef.current;
      scannerRef.current = null;
      if (s) {
        void s
          .stop()
          .then(() => s.clear())
          .catch(() => {});
      }
    };
  }, [open, regionId]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="QR scanner"
    >
      <div className="glass-panel relative w-full max-w-md overflow-hidden p-6 shadow-glow">
        <p className="text-center text-sm font-medium text-primary">
          Point the camera at the QR on the packaging
        </p>
        <div
          id={regionId}
          className="mx-auto mt-4 min-h-[280px] w-full max-w-[320px] overflow-hidden rounded-xl bg-black/40"
        />
        {camErr && (
          <p className="mt-3 text-center text-sm text-amber-200/90">{camErr}</p>
        )}
        <p className="mt-3 text-center text-xs text-secondary font-light">
          Allow camera access when prompted. On desktop, prefer “Scan from
          image”.
        </p>
        <button
          type="button"
          onClick={() => {
            const s = scannerRef.current;
            if (s) {
              void s
                .stop()
                .then(() => s.clear())
                .catch(() => {});
              scannerRef.current = null;
            }
            onClose();
          }}
          className="btn-ghost mt-6 w-full py-3"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
