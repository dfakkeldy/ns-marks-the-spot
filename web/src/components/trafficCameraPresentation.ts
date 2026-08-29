import type { TrafficCameraLayerDescriptor } from "../layers/layerCatalog";
import type { HighwayCamera } from "../data/highwayCameras";

/**
 * The cache key defeats intermediary caching so a reopened popup shows the
 * current frame, not the frame from the last open.
 */
export function cameraImageUrl(
  layer: TrafficCameraLayerDescriptor,
  camera: HighwayCamera,
  cacheKey: number,
): string {
  const base = layer.imageUrlTemplate.replace(
    "{id}",
    encodeURIComponent(camera.id),
  );
  return `${base}?t=${cacheKey}`;
}

/**
 * DOM-built, never innerHTML: camera names originate at 511 and are
 * re-catalogued over time, so they are third-party strings on a delay, not
 * trusted markup.
 */
export function buildCameraPopup(
  layer: TrafficCameraLayerDescriptor,
  camera: HighwayCamera,
  cacheKey: number,
): HTMLElement {
  const root = document.createElement("div");
  root.className = "camera-popup";

  const title = document.createElement("strong");
  title.textContent = camera.name;
  root.append(title);

  const image = document.createElement("img");
  image.src = cameraImageUrl(layer, camera, cacheKey);
  image.alt = `Live view from the ${camera.name} highway camera`;
  image.addEventListener("error", () => {
    const unavailable = document.createElement("p");
    unavailable.className = "camera-popup-unavailable";
    unavailable.textContent =
      "Live image unavailable right now — a source error at 511, not information about the road.";
    image.replaceWith(unavailable);
  });
  root.append(image);

  const caption = document.createElement("small");
  caption.textContent = "Live image, loaded directly from 511 Nova Scotia · ";
  const link = document.createElement("a");
  link.href = layer.sourceUrl;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = "open 511 map";
  caption.append(link);
  root.append(caption);

  return root;
}
