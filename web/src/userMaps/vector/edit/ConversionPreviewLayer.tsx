import L from "leaflet";
import type { Position } from "geojson";
import { Marker, Polyline } from "react-leaflet";

export type ConversionPreview = {
  /** Deduped source positions, [lon, lat], in the order they will connect. */
  positions: Position[];
  /** True for an area: the preview shows the closing segment too. */
  closed: boolean;
};

const PREVIEW_STYLE: L.PathOptions = {
  color: "#b85c1e",
  weight: 2,
  dashArray: "6 6",
  opacity: 0.9,
  fill: false,
};

function badgeIcon(ordinal: number): L.DivIcon {
  return L.divIcon({
    className: "convert-badge-anchor",
    // A number this component computed — nothing user-authored.
    html: `<div class="convert-badge">${ordinal}</div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

/**
 * The dashed connect-the-dots preview with numbered vertex badges, shown
 * while the convert dialog is open. The numbers ARE the safeguard the
 * contract leans on: conversion uses stored order, and the user sees that
 * order before committing. Non-interactive throughout — a preview must not
 * eat the clicks that select features under it.
 */
export function ConversionPreviewLayer({ positions, closed }: ConversionPreview) {
  const latlngs = positions.map(
    ([lng, lat]): [number, number] => [lat, lng],
  );
  const line = closed && latlngs.length >= 3 ? [...latlngs, latlngs[0]] : latlngs;
  return (
    <>
      <Polyline positions={line} interactive={false} pathOptions={PREVIEW_STYLE} />
      {latlngs.map((position, index) => (
        <Marker
          // Positions can repeat across non-consecutive vertices; the index
          // is the identity that matters here.
          key={index}
          position={position}
          icon={badgeIcon(index + 1)}
          interactive={false}
          keyboard={false}
        />
      ))}
    </>
  );
}
