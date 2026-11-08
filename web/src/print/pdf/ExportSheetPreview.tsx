import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { PrintMapBounds } from "../../services/printSnapshot";
import { composeMapImage, type CompositorLayer } from "./mapCompositor";
import type { PdfRect, PdfTemplate } from "./templates/types";

const PREVIEW_MAP_WIDTH_PX = 480;

/** A template rectangle (points, origin bottom-left) as CSS percentages of the page. */
function pageBox(rect: PdfRect, template: PdfTemplate): CSSProperties {
  const { width, height } = template.page;
  return {
    left: `${(rect.x / width) * 100}%`,
    top: `${((height - rect.y - rect.height) / height) * 100}%`,
    width: `${(rect.width / width) * 100}%`,
    height: `${(rect.height / height) * 100}%`,
  };
}

type Preview =
  | { status: "off" | "drawing" | "unavailable" }
  | { status: "ready"; src: string };

/**
 * The sheet about to be made, laid out from the PDF template itself. The map is
 * the real compositor run small, not a screenshot, so it shows the layers the
 * PDF will carry; a preview that cannot draw says so and never blocks the PDF.
 */
export function ExportSheetPreview({
  template,
  bounds,
  layers,
  title,
  subtitle,
  legendOn,
  enabled,
}: {
  template: PdfTemplate;
  bounds: PrintMapBounds;
  layers: CompositorLayer[];
  title: string;
  subtitle: string;
  legendOn: boolean;
  enabled: boolean;
}) {
  const [preview, setPreview] = useState<Preview>({ status: enabled ? "drawing" : "off" });
  // The parent rebuilds this list every render; the frame cannot change while
  // this sheet is up, so the first list is the one to draw.
  const firstLayers = useRef(layers);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const heightPx = Math.round(PREVIEW_MAP_WIDTH_PX * (template.mapFrame.height / template.mapFrame.width));
    composeMapImage(bounds, { widthPx: PREVIEW_MAP_WIDTH_PX, heightPx }, firstLayers.current, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setPreview({ status: "ready", src: result.canvas.toDataURL("image/jpeg", 0.75) });
      })
      .catch(() => {
        if (!controller.signal.aborted) setPreview({ status: "unavailable" });
      });
    return () => controller.abort();
  }, [enabled, bounds, template]);

  // Once the PDF itself is being drawn, the small run has been dropped.
  const status = !enabled && preview.status === "drawing" ? "off" : preview.status;

  return (
    <figure className="export-sheet-preview">
      <div
        className="export-sheet-page"
        style={{ aspectRatio: `${template.page.width} / ${template.page.height}` }}
        role="img"
        aria-label={`Page layout: the framed map, with the title ${title || "left blank"}, ${legendOn ? "a legend, " : ""}credits, a scale bar and a QR code.`}
      >
        <div className="export-sheet-map" style={pageBox(template.mapFrame, template)}>
          {preview.status === "ready" ? <img src={preview.src} alt="" /> : null}
        </div>
        <div className="export-sheet-title" style={pageBox(template.titleBlock, template)}>
          <strong>{title}</strong>
          <span>{subtitle}</span>
        </div>
        {legendOn ? <div className="export-sheet-block" style={pageBox(template.legendBox, template)} /> : null}
        <div className="export-sheet-block" style={pageBox(template.attributionStrip, template)} />
        <div
          className="export-sheet-block"
          style={pageBox({ x: template.qr.x, y: template.qr.y, width: template.qr.size, height: template.qr.size }, template)}
        />
      </div>
      <figcaption role="status">
        {status === "drawing" ? "Drawing a small preview of your frame…"
          : status === "ready" ? "Small preview. The PDF is drawn at full detail, so labels can differ."
          : status === "unavailable" ? "The small preview could not be drawn. The PDF is not affected."
          : "Page layout. Your frame fills the map area."}
      </figcaption>
    </figure>
  );
}
