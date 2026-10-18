import type { PrintMapBounds } from "../../services/printSnapshot";
import { groundMetresBetween } from "../../userMaps/transform/webMercator";
import { METRES_PER_POINT, type PdfRect } from "./templates/types";

export type ScaleBarSpec = {
  metres: number;
  label: string;
  widthPoints: number;
  denominator: number;
  denominatorLabel: string;
};

/** Largest 1/2/5 × 10ⁿ value ≤ target. */
function roundScaleLength(target: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(target));
  const normalized = target / magnitude;
  return (normalized >= 5 ? 5 : normalized >= 2 ? 2 : 1) * magnitude;
}

export function buildScaleBar(
  bounds: PrintMapBounds,
  mapFrame: PdfRect,
  maxWidthPoints: number,
): ScaleBarSpec {
  const midLat = (bounds.north + bounds.south) / 2;
  const groundWidthMetres = groundMetresBetween(
    { lat: midLat, lng: bounds.west },
    { lat: midLat, lng: bounds.east },
  );
  const metresPerPoint = groundWidthMetres / mapFrame.width;
  const denominator = metresPerPoint / METRES_PER_POINT;
  const metres = roundScaleLength(metresPerPoint * maxWidthPoints);
  const rounded = Number(denominator.toPrecision(3));
  return {
    metres,
    label: metres >= 1_000 ? `${metres / 1_000} km` : `${metres} m`,
    widthPoints: metres / metresPerPoint,
    denominator,
    denominatorLabel: `≈ 1:${rounded.toLocaleString("en-CA")}`,
  };
}
