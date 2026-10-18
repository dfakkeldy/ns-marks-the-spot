/**
 * Tooltip content as an inert DOM node.
 *
 * Leaflet's `DivOverlay._updateContent` assigns STRING content with
 * `innerHTML`, so a feature attribute interpolated into a template literal
 * becomes live markup: a user-loaded KML whose feature name is
 * `<img src=x onerror=...>` runs script in this origin the moment the feature
 * is hovered, and so does a third-party service that returns markup in a zone
 * name or an occurrence name. Handing Leaflet an ELEMENT instead skips the
 * innerHTML path entirely, and `textContent` makes the value inert without the
 * escaping dance.
 *
 * Use this for every tooltip built from data this app did not author. The
 * matching popup constructions are `buildFeaturePopup`
 * (userMaps/vector/render/popup.ts) and the escaped `wellLogPopupHtml`
 * (services/wellLogs.ts).
 */
export function textTooltip(text: string): HTMLElement {
  const node = document.createElement("span");
  node.textContent = text;
  return node;
}
