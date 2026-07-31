import { useEffect, useMemo, useState } from "react";
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
  orientation: PdfTemplateId;
  bounds: PrintMapBounds;
  layers: CompositorLayer[];
  defaultTitle: string;
  attributionLines: string[];
  shareUrl: string;
  /**
   * Names of user-imported maps that are currently visible on screen but are
   * NOT included in this export (v1 scope cut: the compositor's warp path
   * supports them, but extracting a decoded raster + mesh from the stored
   * record is follow-up work). Shown with the same treatment as failed
   * layers so the omission is never silent.
   */
  omittedUserMapNames?: string[];
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
  | { stage: "confirm-failures"; result: CompositorResult }
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

function canvasToJpegBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        reject(new Error("JPEG encoding failed."));
        return;
      }
      resolve(new Uint8Array(await blob.arrayBuffer()));
    }, "image/jpeg", 0.85);
  });
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
    "NS Marks The Spot — historical map export",
  );
  const [notes, setNotes] = useState("");
  const [legendOn, setLegendOn] = useState(true);
  const [phase, setPhase] = useState<Phase>({ stage: "idle" });

  const onClose = props.onClose;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const composeImage = props.composeImage ??
    ((onProgress: (progress: CompositorProgress) => void) =>
      composeMapImage(props.bounds,
        { widthPx: resolution.widthPx, heightPx: resolution.heightPx },
        props.layers, { onProgress }));
  const composePdf = props.composePdf ?? composeGeoPdf;
  const saveFile = props.saveFile ?? defaultSaveFile;

  const finishExport = async (result: CompositorResult) => {
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
    const bytes = await composePdf(input);
    saveFile(bytes, `${slugify(title)}-${generatedAt.slice(0, 10)}.pdf`);
    props.onClose();
  };

  const startExport = async () => {
    setPhase({ stage: "rendering", progress: null });
    try {
      const result = await composeImage((progress) =>
        setPhase({ stage: "rendering", progress }));
      const failures = result.statuses.filter(
        ({ status }) => status === "failed",
      );
      if (failures.length > 0) {
        setPhase({ stage: "confirm-failures", result });
        return;
      }
      await finishExport(result);
    } catch (error) {
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
  const omittedUserMapNames = props.omittedUserMapNames ?? [];

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

        {omittedUserMapNames.length > 0 ? (
          <div role="alert" className="export-failures export-omitted-layers">
            <p>Not included in this export:</p>
            <ul>
              {omittedUserMapNames.map((name) => (
                <li key={name}>
                  <strong>{name}</strong>
                  {" — imported map layers aren't supported in PDF exports yet."}
                </li>
              ))}
            </ul>
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
            onClick={props.onClose}>
            Cancel
          </button>
          {phase.stage === "confirm-failures" ? (
            <button type="button" className="primary-action"
              onClick={() => void finishExport(phase.result)}>
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
