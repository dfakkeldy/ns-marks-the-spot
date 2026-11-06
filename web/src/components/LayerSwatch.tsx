import type { CSSProperties } from "react";
import type { LayerSwatchSpec } from "./layerSwatchSpec";

const tint = (color: string, opacity: number) =>
  `color-mix(in srgb, ${color} ${Math.round(opacity * 100)}%, transparent)`;

/** The row's map key (layerSwatchSpec.ts). Decorative: the name says what the layer is. */
export function LayerSwatch({ spec }: { spec: LayerSwatchSpec | null }) {
  if (!spec) return null;
  let style: CSSProperties;
  switch (spec.shape) {
    case "area":
      // The tint lies on map paper (CSS), as it lies on the map, so it shows its own hue on a dark panel too.
      style = { backgroundImage: `linear-gradient(${tint(spec.fill, spec.fillOpacity)}, ${tint(spec.fill, spec.fillOpacity)})`, borderColor: spec.outline ? spec.color : "transparent" };
      break;
    case "line":
      style = { borderTopColor: spec.color, borderTopStyle: spec.dashed ? "dashed" : "solid" };
      break;
    case "dot":
      style = spec.hollow ? { borderColor: spec.color, backgroundColor: tint(spec.color, 0.3) } : { backgroundColor: spec.color, borderColor: spec.color };
      break;
    case "ring":
      style = { borderColor: spec.color };
      break;
    case "classes": {
      const step = 100 / spec.colors.length;
      style = { backgroundImage: `linear-gradient(90deg, ${spec.colors.map((color, i) => `${color} ${i * step}% ${(i + 1) * step}%`).join(", ")})` };
      break;
    }
  }
  const modifiers = [
    `layer-swatch--${spec.shape}`,
    spec.shape === "line" && spec.road ? "layer-swatch--road" : "",
    spec.shape === "line" && spec.casing ? "layer-swatch--casing" : "",
  ].filter(Boolean).join(" ");
  return <span className={`layer-swatch ${modifiers}`} style={style} aria-hidden="true" data-swatch={spec.shape} />;
}
