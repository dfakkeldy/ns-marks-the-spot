import { useEffect, useMemo, useRef, useState } from "react";
import type { PrintMapBounds } from "../../services/printSnapshot";
import { buildScaleBar } from "./scaleBar";
import { buildExportQrPng } from "./exportQr";
import {
  composeMapImage,
  type CompositorLayer,
  type CompositorLayerStatus,
  type CompositorProgress,
  type CompositorResult,
} from "./mapCompositor";
import {
  isConstrainedDevice,
  resolveExportResolution,
} from "./exportResolution";
import { composeGeoPdf, type ComposeInput } from "./pdfComposer";
import { templateForOrientation } from "./templates/index";
import type { PdfTemplateId } from "./templates/types";

export type ExportDialogProps = {
  /** Mode-aware default; the field stays editable. */
  defaultSubtitle?: string;
  orientation: PdfTemplateId;
  bounds: PrintMapBounds;
  layers: CompositorLayer[];
  defaultTitle: string;
  attributionLines: string[];
  shareUrl: string;
  /**
   * Names of layers that are visible on screen but will NOT be in this
   * export — the seven layer families the compositor does not carry yet
   * (resources, hydro pilot, flood hazard, environmental health, forestry,
   * zoning, well logs), any Province layer without export options, and
   * user-imported maps. Shown with the same treatment as failed layers so
   * the omission is never silent. It does not block Download: the user is
   * told what the page will be missing and decides.
   */
  omittedLayerNames?: string[];
  onClose: () => void;
  composeImage?: (
    onProgress: (progress: CompositorProgress) => void,
  ) => Promise<CompositorResult>;
  composePdf?: (input: ComposeInput) => Promise<Uint8Array>;
  saveFile?: (bytes: Uint8Array, filename: string) => void;
};

type Phase =
  | { stage: "idle" }
  | { stage: "rendering"; progress: CompositorProgress | null }
  | {
      stage: "confirm-failures";
      result: CompositorResult;
      controller: AbortController;
    }
  | { stage: "error"; message: string };

function slugify(title: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  return slug || "map";
}

function defaultSaveFile(bytes: Uint8Array, filename: string): void {
  // `new Uint8Array(bytes)` (rather than `bytes` itself) guarantees a plain
  // `ArrayBuffer`-backed view, which is what `BlobPart` requires — `bytes`'s
  // type from pdf-lib is backed by `ArrayBufferLike`, which TS also allows
  // to be a `SharedArrayBuffer`.
  const url = URL.createObjectURL(
    new Blob([new Uint8Array(bytes)], { type: "application/pdf" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  // The executor itself must stay synchronous — an async callback inside a
  // Promise executor can throw/reject without ever calling resolve/reject,
  // leaving the promise (and the export) hanging forever. `toBlob`'s
  // callback only ever hands back the blob (or null); do the async decoding
  // afterward, in `canvasToJpegBytes`, where a rejection properly propagates.
  return new Promise((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", 0.85);
  });
}

async function canvasToJpegBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await canvasToBlob(canvas);
  if (!blob) {
    throw new Error("JPEG encoding failed.");
  }
  return new Uint8Array(await blob.arrayBuffer());
}

export function ExportDialog(props: ExportDialogProps) {
  const template = templateForOrientation(props.orientation);
  const resolution = useMemo(
    () => resolveExportResolution(template.mapFrame, {
      constrainedDevice: isConstrainedDevice(),
    }),
    [template],
  );
  const [title, setTitle] = useState(props.defaultTitle);
  const [subtitle, setSubtitle] = useState(
    props.defaultSubtitle ?? "NS Marks The Spot map export",
  );
  const [notes, setNotes] = useState("");
  const [legendOn, setLegendOn] = useState(true);
  const [phase, setPhase] = useState<Phase>({ stage: "idle" });

  // Tracks the in-flight export attempt, if any, so Cancel/Escape can abort
  // its tile fetches and so any already-running continuation (the
  // composeImage → finishExport pipeline) can notice and bail out instead of
  // downloading a file the user believes they cancelled.
  const exportAbortRef = useRef<AbortController | null>(null);

  const onClose = props.onClose;
  const cancelExport = () => {
    exportAbortRef.current?.abort();
    onClose();
  };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        exportAbortRef.current?.abort();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  // Belt-and-suspenders: if the dialog unmounts through some path other than
  // the Cancel button or Escape key, still abort any in-flight tile fetches.
  useEffect(() => () => exportAbortRef.current?.abort(), []);

  const composeImage = props.composeImage ??
    ((onProgress: (progress: CompositorProgress) => void) =>
      composeMapImage(props.bounds,
        { widthPx: resolution.widthPx, heightPx: resolution.heightPx },
        props.layers, { onProgress, signal: exportAbortRef.current?.signal }));
  const composePdf = props.composePdf ?? composeGeoPdf;
  const saveFile = props.saveFile ?? defaultSaveFile;

  const finishExport = async (
    result: CompositorResult,
    controller: AbortController,
  ) => {
    if (controller.signal.aborted) return;
    const generatedAt = new Date().toISOString();
    const input: ComposeInput = {
      template,
      bounds: props.bounds,
      mapImage: {
        jpegBytes: await canvasToJpegBytes(result.canvas),
        widthPx: result.canvas.width,
        heightPx: result.canvas.height,
      },
      fields: { title, subtitle, notes },
      legend: legendOn
        ? props.layers.map(({ name }) => ({ name, swatchColor: null }))
        : null,
      attributionLines: props.attributionLines,
      qrPngBytes: await buildExportQrPng(props.shareUrl),
      scaleBar: buildScaleBar(
        props.bounds, template.mapFrame, template.scaleBar.maxWidth,
      ),
      generatedAt,
    };
    if (controller.signal.aborted) return;
    const bytes = await composePdf(input);
    if (controller.signal.aborted) return;
    saveFile(bytes, `${slugify(title)}-${generatedAt.slice(0, 10)}.pdf`);
    props.onClose();
  };

  /**
   * "Download anyway" runs the same pipeline as the happy path, so it can
   * fail the same ways (JPEG encode, QR build, PDF compose). Unguarded it
   * rejected into nothing and the dialog sat in confirm-failures with a
   * silently dead button; the failure now lands in the error phase exactly
   * like a first-pass failure.
   */
  const finishExportOrReportError = async (
    result: CompositorResult,
    controller: AbortController,
  ) => {
    try {
      await finishExport(result, controller);
    } catch (error) {
      if (controller.signal.aborted) return;
      setPhase({
        stage: "error",
        message: error instanceof Error ? error.message : "Export failed.",
      });
    }
  };

  const startExport = async () => {
    const controller = new AbortController();
    exportAbortRef.current = controller;
    setPhase({ stage: "rendering", progress: null });
    try {
      const result = await composeImage((progress) => {
        // A stray progress tick that arrives after cancellation must not
        // resurrect the "rendering" phase on an export the user walked away
        // from — that would leave the state machine visibly stuck.
        if (controller.signal.aborted) return;
        setPhase({ stage: "rendering", progress });
      });
      if (controller.signal.aborted) return;
      const failures = result.statuses.filter(
        ({ status }) => status === "failed",
      );
      if (failures.length > 0) {
        setPhase({ stage: "confirm-failures", result, controller });
        return;
      }
      await finishExport(result, controller);
    } catch (error) {
      if (controller.signal.aborted) return;
      setPhase({
        stage: "error",
        message: error instanceof Error ? error.message : "Export failed.",
      });
    }
  };

  const failures: CompositorLayerStatus[] =
    phase.stage === "confirm-failures"
      ? phase.result.statuses.filter(({ status }) => status === "failed")
      : [];
  const omittedLayerNames = props.omittedLayerNames ?? [];

  return (
    <div className="export-dialog-backdrop" role="presentation">
      <div
        className="export-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Export georeferenced PDF"
      >
        <h2>Export georeferenced PDF</h2>
        <p className="field-help">
          Letter {props.orientation} · {resolution.dpi} DPI
          {resolution.reduced
            ? " (reduced to fit this device's memory)"
            : ""}
        </p>
        <label htmlFor="export-title">Title</label>
        <input id="export-title" value={title} autoFocus
          onChange={(event) => setTitle(event.target.value)} />
        <label htmlFor="export-subtitle">Subtitle</label>
        <input id="export-subtitle" value={subtitle}
          onChange={(event) => setSubtitle(event.target.value)} />
        <label htmlFor="export-notes">Notes</label>
        <textarea id="export-notes" value={notes} rows={3}
          onChange={(event) => setNotes(event.target.value)} />
        <label className="export-legend-toggle">
          <input type="checkbox" checked={legendOn} aria-label="Include legend"
            onChange={(event) => setLegendOn(event.target.checked)} />
          Include legend
        </label>

        {omittedLayerNames.length > 0 ? (
          <div role="alert" className="export-failures export-omitted-layers">
            <p>
              These layers are on the map but will not be in the exported PDF:
            </p>
            <ul>
              {omittedLayerNames.map((name) => (
                <li key={name}>
                  <strong>{name}</strong>
                </li>
              ))}
            </ul>
            <p>PDF export doesn&rsquo;t support them yet.</p>
          </div>
        ) : null}

        {phase.stage === "rendering" ? (
          <p role="status">
            Rendering
            {phase.progress?.currentLayer
              ? ` ${phase.progress.currentLayer}`
              : "…"}
            {phase.progress
              ? ` (${phase.progress.completedLayers}/${phase.progress.totalLayers})`
              : null}
          </p>
        ) : null}
        {phase.stage === "error" ? (
          <p role="alert">{phase.message}</p>
        ) : null}
        {failures.length > 0 ? (
          <div role="alert" className="export-failures">
            <p>Some layers could not be included:</p>
            <ul>
              {failures.map((failure) => (
                <li key={failure.id}>
                  <strong>{failure.name}</strong>
                  {failure.detail ? ` — ${failure.detail}` : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="export-dialog-actions">
          <button type="button" className="secondary-action"
            onClick={cancelExport}>
            Cancel
          </button>
          {phase.stage === "confirm-failures" ? (
            <button type="button" className="primary-action"
              onClick={() =>
                void finishExportOrReportError(phase.result, phase.controller)}>
              Download anyway
            </button>
          ) : (
            <button type="button" className="primary-action"
              disabled={phase.stage === "rendering"}
              onClick={() => void startExport()}>
              Download PDF
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
