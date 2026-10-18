import type { PathOptions } from "leaflet";
import type { ForestryLayerDescriptor } from "../layers/layerCatalog";
import { describeOldGrowthPolicyFeature } from "../services/oldGrowthPolicy";
import type { MapRenderMode } from "./parcelStyle";

const POLICY_POPUP_NOTE =
  "Mapped policy area on publicly owned land outside protected areas. This layer is not a complete inventory of old-growth forest and does not establish conditions on private land.";

export function oldGrowthPolicyStyle(
  properties: Record<string, unknown>,
  layer: ForestryLayerDescriptor,
  renderMode: MapRenderMode,
): PathOptions {
  const { status } = describeOldGrowthPolicyFeature(properties);

  if (renderMode === "print") {
    if (status === "confirmed-old-growth") {
      return {
        color: "#2f2f2f",
        fillColor: "#bcbcbc",
        fillOpacity: 0.5,
        weight: 1.5,
        className: "print-old-growth-confirmed",
      };
    }
    if (status === "restoration-opportunity") {
      return {
        color: "#666666",
        fillColor: "#dedede",
        fillOpacity: 0.45,
        weight: 1.4,
        dashArray: "6 3",
        className: "print-old-growth-restoration",
      };
    }
    return {
      color: "#888888",
      fillColor: "#f2f2f2",
      fillOpacity: 0.35,
      weight: 1.3,
      dashArray: "2 3",
      className: "print-old-growth-unknown",
    };
  }

  const color =
    status === "confirmed-old-growth"
      ? layer.statusColors.confirmedOldGrowth
      : status === "restoration-opportunity"
        ? layer.statusColors.restorationOpportunity
        : layer.statusColors.unknown;

  return {
    color,
    fillColor: color,
    fillOpacity: status === "unknown" ? 0.22 : 0.28,
    opacity: layer.opacity,
    weight: status === "confirmed-old-growth" ? 1.7 : 1.4,
    dashArray: status === "unknown" ? "4 3" : undefined,
  };
}

export function buildOldGrowthPolicyPopup(
  properties: Record<string, unknown>,
  layer: ForestryLayerDescriptor,
): HTMLElement {
  const description = describeOldGrowthPolicyFeature(properties);
  const article = document.createElement("article");
  article.className = "old-growth-policy-popup";

  const eyebrow = document.createElement("p");
  eyebrow.className = "old-growth-policy-popup-eyebrow";
  eyebrow.textContent = layer.name;
  article.append(eyebrow);

  const heading = document.createElement("h3");
  heading.textContent = description.statusLabel;
  article.append(heading);

  if (description.hectares !== null) {
    const area = document.createElement("p");
    area.textContent = `${description.hectares.toLocaleString("en-CA", {
      maximumFractionDigits: 2,
    })} ha`;
    article.append(area);
  }

  if (description.selectionMethod) {
    const method = document.createElement("p");
    method.textContent = `Selection method: ${description.selectionMethod}`;
    article.append(method);
  }

  const note = document.createElement("p");
  note.className = "old-growth-policy-popup-note";
  note.textContent = POLICY_POPUP_NOTE;
  article.append(note);

  const sourceLink = document.createElement("a");
  sourceLink.href = layer.sourceUrl;
  sourceLink.target = "_blank";
  sourceLink.rel = "noreferrer";
  sourceLink.textContent = "Official policy layer";
  article.append(sourceLink);

  return article;
}
