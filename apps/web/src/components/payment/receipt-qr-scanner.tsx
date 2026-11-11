"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Camera, CameraOff, Loader2, ScanLine, X } from "lucide-react";
import {
  barcodeDetectorAvailable,
  extractReceiptScan,
  SCAN_FRAME_MAX_EDGE,
  SCAN_INTERVAL_MS,
  type ReceiptScan,
} from "@/lib/qr-scan";

interface ReceiptQrScannerProps {
  /** Called with the decoded receipt. Nothing is submitted from here. */
  onDecoded: (scan: ReceiptScan) => void;
  /** Puts the scanner away without using what it read. */
  onCancel: () => void;
}

type Phase = "starting" | "scanning" | "decoded";

interface NativeDetector {
  detect: (
    source: CanvasImageSource,
  ) => Promise<Array<{ rawValue?: string }>>;
}

function cameraErrorMessage(error: unknown): string {
  const name = (error as { name?: string })?.name ?? "";
  const insecure =
    typeof window !== "undefined" && !window.isSecureContext;
  if (name === "NotAllowedError" || name === "SecurityError" || insecure) {
    return "Camera access needs permission (and HTTPS on a phone). Allow it, or enter the receipt details by hand.";
  }
  if (name === "NotFoundError" || name === "NotReadableError") {
    return "No camera available on this device. Enter the receipt details by hand instead.";
  }
  return "Could not start the camera. Enter the receipt details by hand instead.";
}

/**
 * Live scanner for the QR printed on a bank receipt.
 *
 * It only turns pixels into text: the decoded link or reference is handed to
 * the payment page, which submits it through the ordinary reference flow.
 * Cheki and the bank still decide whether the payment is real — decoding a
 * QR never approves anything, it just saves typing a link off a text message.
 *
 * `BarcodeDetector` is used when the browser has it (Chrome, Edge, Android);
 * otherwise jsQR decodes the same frames synchronously.
 */
export function ReceiptQrScanner({
  onDecoded,
  onCancel,
}: ReceiptQrScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number | null>(null);

  const [phase, setPhase] = useState<Phase>("starting");
  // Both of these are environment facts, so they are read once at mount rather
  // than synchronously inside the effect (react-hooks/set-state-in-effect).
  const [error, setError] = useState(() =>
    typeof navigator !== "undefined" && !navigator.mediaDevices?.getUserMedia
      ? "No camera available on this device. Enter the receipt details by hand instead."
      : "",
  );
  const [usingNative] = useState(() => barcodeDetectorAvailable());
  const [scanned, setScanned] = useState<ReceiptScan | null>(null);
  // Bumped to restart the camera and the decode loop after a rejected read.
  const [runId, setRunId] = useState(0);

  const stopEverything = useCallback(() => {
    if (frameRef.current !== null) {
      window.clearTimeout(frameRef.current);
      frameRef.current = null;
    }
    const video = videoRef.current;
    const stream = video?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((track) => track.stop());
    if (video) video.srcObject = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    let detector: NativeDetector | null = null;

    if (error || !navigator.mediaDevices?.getUserMedia) {
      return () => {
        stopEverything();
      };
    }

    const useNative = barcodeDetectorAvailable();

    void navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: "environment" } } })
      .then(async (stream) => {
        const video = videoRef.current;
        if (cancelled || !video) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        video.srcObject = stream;
        try {
          await video.play();
        } catch {
          // Some browsers refuse autoplay without a gesture; the stream is
          // already attached and the poster frame is enough to start.
        }
        setPhase("scanning");

        if (useNative) {
          const Ctor = (
            window as unknown as {
              BarcodeDetector: new (options: { formats: string[] }) => NativeDetector;
            }
          ).BarcodeDetector;
          detector = new Ctor({ formats: ["qr_code"] });
        }

        const decodeFrame = async (): Promise<string | null> => {
          if (detector) {
            const results = await detector.detect(video).catch(() => null);
            if (results?.length) return results[0].rawValue ?? null;
            // Falling through to jsQR keeps iOS/Firefox on the same frames.
          }
          const canvas = canvasRef.current;
          if (!canvas || !video.videoWidth || !video.videoHeight) return null;
          const scale = Math.min(
            1,
            SCAN_FRAME_MAX_EDGE /
              Math.max(video.videoWidth, video.videoHeight),
          );
          const width = Math.round(video.videoWidth * scale);
          const height = Math.round(video.videoHeight * scale);
          if (canvas.width !== width) {
            canvas.width = width;
            canvas.height = height;
          }
          const context = canvas.getContext("2d", { willReadFrequently: true });
          if (!context) return null;
          context.drawImage(video, 0, 0, width, height);
          const frame = context.getImageData(0, 0, width, height);
          const result = jsQR(frame.data, width, height);
          return result?.data ?? null;
        };

        const schedule = () => {
          if (cancelled) return;
          frameRef.current = window.setTimeout(() => void tick(), SCAN_INTERVAL_MS);
        };

        // A chain, not setInterval: decode work is async and two overlapping
        // passes on one video element waste frames and jank the page.
        const tick = async () => {
          if (cancelled) return;
          const text = await decodeFrame().catch(() => null);
          if (cancelled) return;
          const scan = text ? extractReceiptScan(text) : null;
          if (scan) {
            stopEverything();
            setScanned(scan);
            setPhase("decoded");
            return;
          }
          schedule();
        };

        schedule();
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(cameraErrorMessage(err));
      });

    return () => {
      cancelled = true;
      stopEverything();
    };
  }, [stopEverything, runId, error]);

  return (
    <div className="border border-default rounded-2xl bg-surface p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-primary flex items-center gap-2">
            <ScanLine className="h-4 w-4" />
            Scan the receipt&apos;s QR code
          </p>
          <p className="text-xs text-muted mt-1">
            Hold the QR on your bank receipt inside the frame. We only read the
            link — verification still runs against the bank.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Stop scanning"
          className="text-muted hover:text-primary transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {error ? (
        <p className="text-xs text-error flex items-start gap-1.5">
          <CameraOff className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          {error}
        </p>
      ) : (
        <div className="relative rounded-xl overflow-hidden bg-black/40 aspect-[4/3]">
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="h-full w-full object-cover"
          />
          <canvas ref={canvasRef} className="hidden" />
          {phase === "starting" && (
            <p className="absolute inset-0 flex items-center justify-center gap-2 text-xs text-white/80">
              <Loader2 className="h-4 w-4 animate-spin" />
              Starting camera…
            </p>
          )}
          {phase === "scanning" && (
            <>
              <div className="absolute inset-8 border-2 border-white/70 rounded-lg" />
              <p className="absolute bottom-2 left-0 right-0 text-center text-xs text-white/80">
                Looking for a receipt QR…
              </p>
            </>
          )}
        </div>
      )}

      {phase === "decoded" && scanned ? (
        <div className="space-y-2">
          <p className="text-xs text-secondary break-all font-mono">
            {scanned.raw}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onDecoded(scanned)}
              className="flex-1 bg-accent hover:bg-accent-hover text-white text-sm
                font-medium rounded-xl py-2.5"
            >
              Use this receipt
            </button>
            <button
              type="button"
              onClick={() => {
                stopEverything();
                setScanned(null);
                setError("");
                setPhase("starting");
                setRunId((id) => id + 1);
              }}
              className="text-sm text-secondary hover:text-primary px-3 py-2.5
                border border-default rounded-xl"
            >
              Scan again
            </button>
          </div>
        </div>
      ) : (
        !error && (
          <p className="text-xs text-muted">
            {usingNative
              ? "Decoding with the browser's built-in scanner."
              : "Decoding with the bundled scanner — a few frames per second."}
          </p>
        )
      )}

      {!error && phase === "scanning" && (
        <p className="text-xs text-muted flex items-center gap-1.5">
          <Camera className="h-3.5 w-3.5" />
          The camera is never left running once a code is read.
        </p>
      )}
    </div>
  );
}
