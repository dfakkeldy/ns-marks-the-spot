import { useEffect, useRef, useState } from "react";
import { useMap } from "react-leaflet";
import { buildScaleBar } from "./scaleBar";
import {
  boundsForFrameRect,
  frameScreenRect,
  MAX_FRAME_SCALE,
  MIN_FRAME_SCALE,
  type FrameState,
} from "./frameGeometry";
import { templateForOrientation } from "./templates/index";
import { mapFrameAspect, type PdfTemplateId } from "./templates/types";
import type { PrintMapBounds } from "../../services/printSnapshot";

type ExportFrameLayerProps = {
  state: FrameState;
  onStateChange: (state: FrameState) => void;
  onCancel: () => void;
  onContinue: (bounds: PrintMapBounds, orientation: PdfTemplateId) => void;
};

export function ExportFrameLayer({
  state, onStateChange, onCancel, onContinue,
}: ExportFrameLayerProps) {
  const map = useMap();
  const [, setMapEpoch] = useState(0);
  const dragRef = useRef<
    | { kind: "move" | "resize"; startX: number; startY: number;
        startState: FrameState }
    | null
  >(null);

  useEffect(() => {
    const bump = () => setMapEpoch((epoch) => epoch + 1);
    map.on("move zoom resize", bump);
    return () => {
      map.off("move zoom resize", bump);
    };
  }, [map]);

  const container = { width: map.getSize().x, height: map.getSize().y };
  const template = templateForOrientation(state.orientation);
  const aspect = mapFrameAspect(template);
  const rect = frameScreenRect(container, aspect, state);
  const centre = map.getCenter();
  const bounds = boundsForFrameRect(
    rect, container, { lat: centre.lat, lng: centre.lng }, map.getZoom(),
  );
  const scaleReadout = buildScaleBar(
    bounds, template.mapFrame, template.scaleBar.maxWidth,
  ).denominatorLabel;

  const onPointerDown = (kind: "move" | "resize") =>
    (event: React.PointerEvent<HTMLElement>) => {
      event.preventDefault();
      // The resize handle sits inside the frame div, so a pointerdown on the
      // handle also bubbles to the frame's own onPointerDown. Without this,
      // that bubbled call overwrites dragRef.current right after the handle
      // sets it, so every drag — even one that starts on the handle —
      // resolves to "move" and resizing is unreachable. Stopping propagation
      // also keeps the event from reaching Leaflet's own mousedown listener
      // on the map container (see map.dragging.disable() below, which is the
      // primary guard against that).
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = {
        kind, startX: event.clientX, startY: event.clientY, startState: state,
      };
      // Leaflet's Draggable starts a map pan on its own native
      // mousedown/touchstart listener attached to the map container — a
      // listener the frame div sits inside of. Relying on the pointer event
      // being stopped/prevented is not reliable across browsers/input types,
      // so explicitly disable map dragging for the duration of this drag and
      // re-enable it on pointer up/cancel below.
      map.dragging.disable();
    };
  const onPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (drag.kind === "move") {
      onStateChange({
        ...drag.startState,
        offsetX: drag.startState.offsetX + deltaX,
        offsetY: drag.startState.offsetY + deltaY,
      });
    } else {
      const next = drag.startState.scale + deltaY / container.height;
      onStateChange({
        ...drag.startState,
        scale: Math.min(MAX_FRAME_SCALE, Math.max(MIN_FRAME_SCALE, next)),
      });
    }
  };
  const endDrag = () => {
    dragRef.current = null;
    map.dragging.enable();
  };

  return (
    <div className="export-frame-layer" aria-label="PDF export frame">
      <div
        className="export-frame"
        role="application"
        style={{
          left: rect.x, top: rect.y, width: rect.width, height: rect.height,
        }}
        onPointerDown={onPointerDown("move")}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <span className="export-frame-scale">{scaleReadout}</span>
        <span
          className="export-frame-handle"
          role="slider"
          aria-label="Resize export frame"
          aria-valuenow={Math.round(state.scale * 100)}
          onPointerDown={onPointerDown("resize")}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />
      </div>
      <div className="export-frame-toolbar">
        <button
          type="button"
          className="secondary-action"
          aria-pressed={state.orientation === "portrait"}
          onClick={() =>
            onStateChange({
              ...state,
              orientation:
                state.orientation === "portrait" ? "landscape" : "portrait",
            })}
        >
          {state.orientation === "portrait" ? "Portrait" : "Landscape"}
        </button>
        <button type="button" className="secondary-action" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="primary-action"
          onClick={() => onContinue(bounds, state.orientation)}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
