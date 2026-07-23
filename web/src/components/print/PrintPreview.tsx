import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { MapPosition, ShareLayerId } from "../../services/mapShareState";
import { buildPrintQr, type PrintQrResult } from "../../services/printQr";
import {
  buildPrintMapShareUrl,
  printBoundsForTemplate,
  printCaptureReadiness,
  printedLayerIds,
  printScaleForPosition,
  sealPrintSnapshot,
  type PrintCapture,
  type PrintSnapshot,
  type PrintTemplate,
} from "../../services/printSnapshot";
import { PrintFieldDocument } from "./PrintFieldDocument";
import { PrintMap, type PrintMapReadiness } from "./PrintMap";
import { PrintResearchDocument } from "./PrintResearchDocument";

const EVIDENCE_TIMEOUT_MS = 15_000;

export function PrintPreview({
  capture,
  baseUrl,
  onClose,
}: {
  capture: PrintCapture;
  baseUrl: string;
  onClose: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [template, setTemplate] = useState<PrintTemplate>("research");
  const [includeAppendix, setIncludeAppendix] = useState(true);
  const [includeAerial, setIncludeAerial] = useState(false);
  const [timedOutKey, setTimedOutKey] = useState<string | null>(null);
  const [mapAttempt, setMapAttempt] = useState(0);
  const [mapReadiness, setMapReadiness] =
    useState<PrintMapReadiness>({ status: "loading" });
  const [resolvedPosition, setResolvedPosition] =
    useState<MapPosition | null>(null);
  const [printIncomplete, setPrintIncomplete] = useState(false);
  const [settledQr, setSettledQr] = useState<{
    key: string;
    result: PrintQrResult;
  } | null>(null);

  const captureReadiness = printCaptureReadiness(capture, template);
  const timeoutKey = `${capture.token}:${capture.pid}:${template}`;
  const timedOut = timedOutKey === timeoutKey && !captureReadiness.ready;
  const snapshot = useMemo<PrintSnapshot | null>(() => {
    if (!captureReadiness.ready && !timedOut) return null;
    return sealPrintSnapshot(capture, template, {
      timedOut,
      generatedAt: new Date().toISOString(),
    });
  }, [capture, captureReadiness.ready, template, timedOut]);
  const bounds = useMemo(
    () => snapshot ? printBoundsForTemplate(snapshot, template) : null,
    [snapshot, template],
  );
  const printedLayers = useMemo<ShareLayerId[]>(
    () => snapshot ? printedLayerIds([...snapshot.layerIds], includeAerial) : [],
    [includeAerial, snapshot],
  );
  const belowZoomLayerIds = mapReadiness.status === "loading"
    ? []
    : mapReadiness.belowZoomLayerIds;
  const failedLayerIds = mapReadiness.status === "error"
    ? mapReadiness.failedLayerIds
    : [];
  const renderedLayerIds = printedLayers.filter(
    (id) => !belowZoomLayerIds.includes(id) && !failedLayerIds.includes(id),
  );
  const shareUrl = useMemo(
    () => snapshot && resolvedPosition
      ? buildPrintMapShareUrl(baseUrl, snapshot, resolvedPosition, includeAerial)
      : baseUrl,
    [baseUrl, includeAerial, resolvedPosition, snapshot],
  );
  const qrKey = snapshot && resolvedPosition ? `${template}:${shareUrl}` : null;
  const qr: PrintQrResult | { status: "loading" } =
    qrKey && settledQr?.key === qrKey ? settledQr.result : { status: "loading" };

  useEffect(() => {
    if (template !== "research" || captureReadiness.ready) return;
    const timer = window.setTimeout(
      () => setTimedOutKey(timeoutKey),
      EVIDENCE_TIMEOUT_MS,
    );
    return () => window.clearTimeout(timer);
  }, [captureReadiness.ready, template, timeoutKey]);

  useEffect(() => {
    let cancelled = false;
    if (!qrKey) return;
    void buildPrintQr(shareUrl)
      .then((result) => {
        if (!cancelled) setSettledQr({ key: qrKey, result });
      })
      .catch(() => {
        if (!cancelled) setSettledQr({ key: qrKey, result: { status: "error" } });
      });
    return () => {
      cancelled = true;
    };
  }, [qrKey, shareUrl]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    document.body.classList.add("print-preview-open");
    headingRef.current?.focus();
    return () => {
      document.body.classList.remove("print-preview-open");
      previous?.focus();
    };
  }, []);

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), a[href], select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );
    if (focusable.length === 0) {
      event.preventDefault();
      headingRef.current?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const canPrint =
    snapshot !== null &&
    resolvedPosition !== null &&
    qr.status !== "loading" &&
    (mapReadiness.status === "ready" || printIncomplete);
  const printDocument = () => {
    if (!canPrint) return;
    window.print();
  };
  const retryMap = () => {
    setPrintIncomplete(false);
    setMapReadiness({ status: "loading" });
    setResolvedPosition(null);
    setMapAttempt((attempt) => attempt + 1);
  };

  const map = snapshot && bounds ? (
    <>
      <PrintMap
        key={mapAttempt}
        snapshot={snapshot}
        bounds={bounds}
        includeAerial={includeAerial}
        onReadinessChange={setMapReadiness}
        onResolvedPosition={setResolvedPosition}
      />
      {printIncomplete ? (
        <p className="print-incomplete-map-warning">
          Incomplete map: one or more enabled layers failed to render at export time.
        </p>
      ) : null}
    </>
  ) : null;
  const scale = printScaleForPosition(resolvedPosition ?? capture.viewport.position);

  return (
    <div className="print-preview-backdrop">
      <div
        className="print-preview-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="print-preview-heading"
        onKeyDown={handleDialogKeyDown}
      >
        <aside className="print-preview-controls" aria-label="Print preview controls">
          <h2 id="print-preview-heading" ref={headingRef} tabIndex={-1}>Print preview</h2>
          <label>
            Document template
            <select
              aria-label="Document template"
              value={template}
              onChange={(event) => setTemplate(event.target.value as PrintTemplate)}
            >
              <option value="research">Research summary</option>
              <option value="field">Field sheet</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={includeAppendix}
              onChange={(event) => setIncludeAppendix(event.target.checked)}
            />
            Include evidence appendix
          </label>
          <label>
            <input
              type="checkbox"
              checked={includeAerial}
              onChange={(event) => setIncludeAerial(event.target.checked)}
            />
            Include aerial imagery
          </label>
          {!snapshot ? <p role="status">Waiting for research evidence to settle.</p> : null}
          {mapReadiness.status === "loading" && snapshot ? <p role="status">Preparing map preview.</p> : null}
          {mapReadiness.status === "error" ? (
            <div className="print-map-error" role="alert">
              <p>One or more map layers failed to render.</p>
              <button type="button" onClick={retryMap}>Retry map</button>
              <button type="button" onClick={() => setPrintIncomplete(true)}>Print incomplete map</button>
            </div>
          ) : null}
          <button type="button" onClick={printDocument} disabled={!canPrint}>Print / Save PDF</button>
          <button type="button" onClick={onClose}>Close preview</button>
        </aside>
        <main className="print-preview-stage" aria-live="polite">
          {snapshot && map ? template === "research" ? (
            <PrintResearchDocument
              snapshot={snapshot}
              map={map}
              includeAerial={includeAerial}
              includeAppendix={includeAppendix}
              scale={scale}
              shareUrl={shareUrl}
              qr={qr.status === "loading" ? { status: "error" } : qr}
              renderedLayerIds={renderedLayerIds}
              belowZoomLayerIds={belowZoomLayerIds}
              failedLayerIds={failedLayerIds}
            />
          ) : (
            <PrintFieldDocument
              snapshot={snapshot}
              map={map}
              includeAerial={includeAerial}
              scale={scale}
              shareUrl={shareUrl}
              qr={qr.status === "loading" ? { status: "error" } : qr}
              renderedLayerIds={renderedLayerIds}
              belowZoomLayerIds={belowZoomLayerIds}
              failedLayerIds={failedLayerIds}
            />
          ) : <p className="print-preview-placeholder">Preparing printable document.</p>}
        </main>
      </div>
    </div>
  );
}
