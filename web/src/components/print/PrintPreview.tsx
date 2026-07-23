import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
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

type MapAttemptState = {
  token: string;
  readiness: PrintMapReadiness;
  resolvedPosition: MapPosition | null;
  printIncomplete: boolean;
};

type SnapshotStore = {
  captureToken: string | null;
  byTemplate: Partial<Record<PrintTemplate, PrintSnapshot>>;
};

function loadingMapReadiness(): PrintMapReadiness {
  return {
    status: "loading",
    renderedLayerIds: [],
    failedLayerIds: [],
    belowZoomLayerIds: [],
  };
}

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
  const activeMapAttemptRef = useRef<string | null>(null);
  const [template, setTemplate] = useState<PrintTemplate>("research");
  const [includeAppendix, setIncludeAppendix] = useState(true);
  const [includeAerial, setIncludeAerial] = useState(false);
  const [sealedSnapshots, setSealedSnapshots] = useState<SnapshotStore>(() => {
    if (!printCaptureReadiness(capture, "research").ready) {
      return { captureToken: capture.token, byTemplate: {} };
    }
    return {
      captureToken: capture.token,
      byTemplate: {
        research: sealPrintSnapshot(capture, "research", {
          timedOut: false,
          generatedAt: new Date().toISOString(),
        }),
      },
    };
  });
  const [mapAttempt, setMapAttempt] = useState(0);
  const [mapState, setMapState] = useState<MapAttemptState | null>(null);
  const [settledQr, setSettledQr] = useState<{
    key: string;
    result: PrintQrResult;
  } | null>(null);

  const captureReadiness = printCaptureReadiness(capture, template);
  const snapshot = sealedSnapshots.captureToken === capture.token
    ? sealedSnapshots.byTemplate[template] ?? null
    : null;
  const sealSnapshot = useCallback((templateToSeal: PrintTemplate, didTimeOut: boolean) => {
    setSealedSnapshots((current) => {
      const byTemplate = current.captureToken === capture.token
        ? current.byTemplate
        : {};
      if (byTemplate[templateToSeal]) return current;
      return {
        captureToken: capture.token,
        byTemplate: {
          ...byTemplate,
          [templateToSeal]: sealPrintSnapshot(capture, templateToSeal, {
            timedOut: didTimeOut,
            generatedAt: new Date().toISOString(),
          }),
        },
      };
    });
  }, [capture]);
  const bounds = useMemo(
    () => snapshot ? printBoundsForTemplate(snapshot, snapshot.template) : null,
    [snapshot],
  );
  const requestedLayerIds = useMemo<ShareLayerId[]>(
    () => snapshot ? printedLayerIds([...snapshot.layerIds], includeAerial) : [],
    [includeAerial, snapshot],
  );
  const mapConfigurationKey = snapshot && bounds
    ? JSON.stringify({
        captureToken: capture.token,
        template: snapshot.template,
        includeAerial,
        bounds,
        requestedLayerIds,
      })
    : null;
  const attemptToken = mapConfigurationKey ? `${mapConfigurationKey}:${mapAttempt}` : null;
  const activeMapState = mapState?.token === attemptToken ? mapState : null;
  const mapReadiness = activeMapState?.readiness ?? loadingMapReadiness();
  const resolvedPosition = activeMapState?.resolvedPosition ?? null;
  const printIncomplete = activeMapState?.printIncomplete ?? false;
  const renderedLayerIds = mapReadiness.renderedLayerIds.filter(
    (id): id is ShareLayerId => requestedLayerIds.includes(id as ShareLayerId),
  );
  const belowZoomLayerIds = mapReadiness.belowZoomLayerIds;
  const failedLayerIds = mapReadiness.status === "ready"
    ? []
    : mapReadiness.failedLayerIds;
  const shareUrl = useMemo(
    () => snapshot && resolvedPosition
      ? buildPrintMapShareUrl(baseUrl, snapshot, resolvedPosition, renderedLayerIds)
      : baseUrl,
    [baseUrl, renderedLayerIds, resolvedPosition, snapshot],
  );
  const qrKey = attemptToken && snapshot && resolvedPosition
    ? `${attemptToken}:${shareUrl}`
    : null;
  const qr: PrintQrResult | { status: "loading" } =
    qrKey && settledQr?.key === qrKey ? settledQr.result : { status: "loading" };

  useEffect(() => {
    activeMapAttemptRef.current = attemptToken;
  }, [attemptToken]);

  useEffect(() => {
    if (!captureReadiness.ready || snapshot) return;
    const timer = window.setTimeout(() => sealSnapshot(template, false), 0);
    return () => window.clearTimeout(timer);
  }, [captureReadiness.ready, sealSnapshot, snapshot, template]);

  useEffect(() => {
    if (template !== "research" || captureReadiness.ready) return;
    const timer = window.setTimeout(
      () => {
        sealSnapshot("research", true);
      },
      EVIDENCE_TIMEOUT_MS,
    );
    return () => window.clearTimeout(timer);
  }, [captureReadiness.ready, sealSnapshot, template]);

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
    if (event.shiftKey && (
      document.activeElement === first || document.activeElement === headingRef.current
    )) {
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
    setMapAttempt((attempt) => attempt + 1);
  };
  const acceptMapReadiness = (token: string, readiness: PrintMapReadiness) => {
    setMapState((current) => {
      if (activeMapAttemptRef.current !== token) return current;
      return {
        token,
        readiness,
        resolvedPosition: current?.token === token ? current.resolvedPosition : null,
        printIncomplete: current?.token === token ? current.printIncomplete : false,
      };
    });
  };
  const acceptResolvedPosition = (token: string, position: MapPosition) => {
    setMapState((current) => {
      if (activeMapAttemptRef.current !== token) return current;
      return {
        token,
        readiness: current?.token === token ? current.readiness : loadingMapReadiness(),
        resolvedPosition: position,
        printIncomplete: current?.token === token ? current.printIncomplete : false,
      };
    });
  };
  const permitIncompletePrint = () => {
    if (!attemptToken) return;
    setMapState((current) => {
      if (activeMapAttemptRef.current !== attemptToken || current?.token !== attemptToken) {
        return current;
      }
      return { ...current, printIncomplete: true };
    });
  };

  const map = snapshot && bounds ? (
    <>
      <PrintMap
        key={attemptToken}
        snapshot={snapshot}
        bounds={bounds}
        includeAerial={includeAerial}
        onReadinessChange={(value) => acceptMapReadiness(attemptToken!, value)}
        onResolvedPosition={(value) => acceptResolvedPosition(attemptToken!, value)}
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
              onChange={(event) => {
                const nextTemplate = event.target.value as PrintTemplate;
                if (printCaptureReadiness(capture, nextTemplate).ready) {
                  sealSnapshot(nextTemplate, false);
                }
                setTemplate(nextTemplate);
              }}
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
              <button type="button" onClick={permitIncompletePrint}>Print incomplete map</button>
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
