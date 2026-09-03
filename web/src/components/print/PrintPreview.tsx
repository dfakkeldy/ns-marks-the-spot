import { useCallback, useEffect, useInsertionEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { MapPosition, ShareLayerId } from "../../services/mapShareState";
import { buildPrintQr, type PrintQrResult } from "../../services/printQr";
import {
  buildPrintMapShareUrl,
  printBoundsForTemplate,
  printCaptureReadiness,
  printedLayerIds,
  printScaleForPosition,
  sealPrintSnapshot,
  unansweredEvidenceNames,
  type PrintCapture,
  type PrintSnapshot,
  type PrintTemplate,
} from "../../services/printSnapshot";
import { PrintFieldDocument } from "./PrintFieldDocument";
import { PrintMap, type PrintMapReadiness } from "./PrintMap";
import { PrintResearchDocument } from "./PrintResearchDocument";

const EVIDENCE_TIMEOUT_MS = 15_000;
const MAP_TIMEOUT_MS = 15_000;

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

function loadingMapReadiness(): Extract<
  PrintMapReadiness,
  { status: "loading" }
> {
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
  // The capture behind the seal, read at the moment of sealing rather than
  // captured in the callback. Every evidence answer produces a new `capture`,
  // and a `sealSnapshot` that changed with it restarted the timeout below —
  // so a page with several slow sources sealed long after the fifteen seconds
  // it promises, or never, while each answer pushed the deadline out again.
  const captureRef = useRef(capture);
  useEffect(() => {
    captureRef.current = capture;
  }, [capture]);
  const sealSnapshot = useCallback((templateToSeal: PrintTemplate, didTimeOut: boolean) => {
    const sealing = captureRef.current;
    setSealedSnapshots((current) => {
      const byTemplate = current.captureToken === sealing.token
        ? current.byTemplate
        : {};
      if (byTemplate[templateToSeal]) return current;
      return {
        captureToken: sealing.token,
        byTemplate: {
          ...byTemplate,
          [templateToSeal]: sealPrintSnapshot(sealing, templateToSeal, {
            timedOut: didTimeOut,
            generatedAt: new Date().toISOString(),
          }),
        },
      };
    });
  }, []);
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
    : [
        ...mapReadiness.failedLayerIds,
        ...(mapReadiness.status === "error"
          ? mapReadiness.timedOutLayerIds ?? []
          : []),
      ];
  const shareUrl =
    snapshot && resolvedPosition
      ? buildPrintMapShareUrl(
          baseUrl,
          snapshot,
          resolvedPosition,
          renderedLayerIds,
        )
      : baseUrl;
  const qrKey = attemptToken && snapshot && resolvedPosition
    ? `${attemptToken}:${shareUrl}`
    : null;
  const qr: PrintQrResult | { status: "loading" } =
    qrKey && settledQr?.key === qrKey ? settledQr.result : { status: "loading" };

  useInsertionEffect(() => {
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
    if (!attemptToken || !snapshot) return;
    const timer = window.setTimeout(() => {
      setMapState((current) => {
        if (
          activeMapAttemptRef.current !== attemptToken ||
          (current !== null && current.token !== attemptToken) ||
          (current !== null && current.readiness.status !== "loading")
        ) {
          return current;
        }
        const currentReadiness =
          current?.readiness.status === "loading"
            ? current.readiness
            : loadingMapReadiness();
        const resolvedIds = new Set([
          ...currentReadiness.renderedLayerIds,
          ...currentReadiness.failedLayerIds,
          ...currentReadiness.belowZoomLayerIds,
        ]);
        const timedOutLayerIds = requestedLayerIds.filter(
          (id) => !resolvedIds.has(id),
        );
        if (timedOutLayerIds.length === 0) return current;
        return {
          token: attemptToken,
          resolvedPosition: current?.resolvedPosition ?? null,
          printIncomplete: current?.printIncomplete ?? false,
          readiness: {
            status: "error",
            renderedLayerIds: currentReadiness.renderedLayerIds,
            failedLayerIds: currentReadiness.failedLayerIds,
            belowZoomLayerIds: currentReadiness.belowZoomLayerIds,
            timedOutLayerIds,
          },
        };
      });
    }, MAP_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [attemptToken, requestedLayerIds, snapshot]);

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
  const acceptMapReadiness = useCallback((token: string, readiness: PrintMapReadiness) => {
    setMapState((current) => {
      if (activeMapAttemptRef.current !== token) return current;
      if (
        current?.token === token &&
        current.readiness.status === "error" &&
        (current.readiness.timedOutLayerIds?.length ?? 0) > 0
      ) {
        return current;
      }
      return {
        token,
        readiness,
        resolvedPosition: current?.token === token ? current.resolvedPosition : null,
        printIncomplete: current?.token === token ? current.printIncomplete : false,
      };
    });
  }, []);
  const acceptResolvedPosition = useCallback((token: string, position: MapPosition) => {
    setMapState((current) => {
      if (activeMapAttemptRef.current !== token) return current;
      return {
        token,
        readiness: current?.token === token ? current.readiness : loadingMapReadiness(),
        resolvedPosition: position,
        printIncomplete: current?.token === token ? current.printIncomplete : false,
      };
    });
  }, []);
  const handleMapReadinessChange = useCallback(
    (value: PrintMapReadiness) => acceptMapReadiness(attemptToken!, value),
    [acceptMapReadiness, attemptToken],
  );
  const handleResolvedPosition = useCallback(
    (value: MapPosition) => acceptResolvedPosition(attemptToken!, value),
    [acceptResolvedPosition, attemptToken],
  );
  const permitIncompletePrint = () => {
    if (!attemptToken) return;
    setMapState((current) => {
      if (activeMapAttemptRef.current !== attemptToken || current?.token !== attemptToken) {
        return current;
      }
      return { ...current, printIncomplete: true };
    });
  };
  const timedOutLayerNames =
    mapReadiness.status === "error"
      ? (mapReadiness.timedOutLayerIds ?? []).map(
          (id) =>
            snapshot?.layerSources.find((source) => source.id === id)?.name ??
            id,
        )
      : [];
  const unansweredNames = snapshot ? unansweredEvidenceNames(snapshot) : [];
  const appendixAvailable = template === "research";
  const aerialAvailable = capture.layerIds.includes("ns-aerial");

  const map = snapshot && bounds ? (
    <>
      <PrintMap
        key={attemptToken}
        snapshot={snapshot}
        bounds={bounds}
        includeAerial={includeAerial}
        onReadinessChange={handleMapReadinessChange}
        onResolvedPosition={handleResolvedPosition}
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
      <style data-print-page-style>
        {`@page { size: letter ${template === "field" ? "landscape" : "portrait"}; margin: 10mm; }`}
      </style>
      <div
        className="print-preview-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Print / export"
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
              disabled={!appendixAvailable}
              onChange={(event) => setIncludeAppendix(event.target.checked)}
            />
            Include evidence appendix
          </label>
          {!appendixAvailable ? (
            <p>Available for the Research summary only.</p>
          ) : null}
          <label>
            <input
              type="checkbox"
              checked={includeAerial}
              disabled={!aerialAvailable}
              onChange={(event) => setIncludeAerial(event.target.checked)}
            />
            Include aerial imagery
          </label>
          {!aerialAvailable ? (
            <p>Aerial imagery was not captured in this map state.</p>
          ) : null}
          {!snapshot ? <p role="status">Waiting for research evidence to settle.</p> : null}
          {unansweredNames.length > 0 ? (
            <p role="status">
              Sealed while {unansweredNames.join(", ")} had not answered. The
              document says so on its front page.
            </p>
          ) : null}
          {mapReadiness.status === "loading" && snapshot ? <p role="status">Preparing map preview.</p> : null}
          {mapReadiness.status === "error" ? (
            <div className="print-map-error" role="alert">
              <p>
                {timedOutLayerNames.length > 0
                  ? `Timed out waiting for: ${timedOutLayerNames.join(", ")}.`
                  : "One or more map layers failed to render."}
              </p>
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
