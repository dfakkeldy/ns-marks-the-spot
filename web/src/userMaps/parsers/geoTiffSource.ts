import { fromArrayBuffer } from "geotiff";
import type { GeoTIFFImage, TypedArrayWithDimensions } from "geotiff";
import { UserMapImportError } from "../errors";
import {
  pixelToLatLng,
  validateCrs,
  type EmbeddedGeoref,
  type PixelSize,
} from "../transform/projection";

import { PREVIEW_MAX_DIMENSION } from "./previewBudget";

export { PREVIEW_MAX_DIMENSION };

/**
 * Above this many pixels, a failed decode of the CHOSEN source image (base
 * or the smallest covering overview) is treated as "valid raster, too big
 * to decode here" rather than "corrupt file". PREVIEW_MAX_DIMENSION only
 * caps the RETAINED preview — geotiff still has to materialize the chosen
 * image's full pixel grid to build it, so a raster with no internal
 * overview small enough to cover the target can exhaust the browser's heap
 * on perfectly good data. Set generously above any real preview target so
 * genuinely small/corrupt inputs still get the "corrupt-file" message.
 */
const DECODE_TOO_LARGE_PIXEL_THRESHOLD = 50_000_000;

export type MakePreview = (
  rgb: Uint8Array,
  width: number,
  height: number,
) => Promise<Blob>;

export type ParsedGeoTiff = {
  pixelSize: PixelSize;
  /** null when the file carries no usable georeferencing — the caller then
   * routes it to the georeferencer as a plain scan. */
  georef: EmbeddedGeoref | null;
  preview: Blob;
  previewSize: PixelSize;
};

/**
 * Smallest image (base or overview) whose longest edge still covers the
 * preview target, so huge rasters decode from an overview instead of the
 * base image. Falls back to index 0 (the base) when nothing covers it —
 * upscaling an overview would fabricate detail.
 */
export function chooseImageIndex(sizes: PixelSize[], target: number): number {
  let best = 0;
  let bestMax = Number.POSITIVE_INFINITY;
  for (let i = 0; i < sizes.length; i += 1) {
    const max = Math.max(sizes[i].width, sizes[i].height);
    if (max >= target && max < bestMax) {
      best = i;
      bestMax = max;
    }
  }
  return best;
}

type GeoTiffDirectory = {
  ModelPixelScale?: number[];
  ModelTiepoint?: number[];
  ModelTransformation?: number[];
};

type GeoKeyBag = {
  ProjectedCSTypeGeoKey?: number;
  GeographicTypeGeoKey?: number;
  GTRasterTypeGeoKey?: number;
  GTCitationGeoKey?: string;
  PCSCitationGeoKey?: string;
};

function geotransformFrom(
  directory: GeoTiffDirectory,
  pixelIsPoint: boolean,
): EmbeddedGeoref["geotransform"] | null {
  const { ModelPixelScale: scale, ModelTiepoint: tie, ModelTransformation: m } =
    directory;
  if (m) {
    if (m.length < 16) {
      // The tag is defined as a full 4x4 matrix; anything shorter is broken.
      return null;
    }
    // Row-major 4x4 affine: x' = m0·x + m1·y + m3; y' = m4·x + m5·y + m7.
    return [m[3], m[0], m[1], m[7], m[4], m[5]];
  }
  if (scale && scale.length >= 2 && tie && tie.length >= 6) {
    if (tie.length > 6) {
      // Multiple tiepoints without a transformation matrix = irregular
      // georeferencing we do not support; treat as ungeoreferenced.
      return null;
    }
    let originX = tie[3] - tie[0] * scale[0];
    let originY = tie[4] + tie[1] * scale[1];
    if (pixelIsPoint) {
      // PixelIsPoint ties the CENTRE of the pixel; area semantics shift the
      // origin back half a pixel (north-up: y resolution is negative).
      originX -= scale[0] / 2;
      originY += scale[1] / 2;
    }
    return [originX, scale[0], 0, originY, 0, -scale[1]];
  }
  return null;
}

function crsFrom(geoKeys: GeoKeyBag): string | null {
  const epsg = geoKeys.ProjectedCSTypeGeoKey ?? geoKeys.GeographicTypeGeoKey;
  if (epsg && epsg !== 32767) {
    return `EPSG:${epsg}`;
  }
  // User-defined CRS: best-effort — some producers put a proj4/WKT string in
  // the citation keys, which proj4 can parse directly. validateCrs decides.
  const citation = geoKeys.PCSCitationGeoKey ?? geoKeys.GTCitationGeoKey;
  return citation ?? null;
}

/** 16-bit samples scale down (>>8); anything else clamps into 8-bit. */
function toUint8Rgb(raw: ArrayLike<number>): Uint8Array {
  if (raw instanceof Uint8Array) {
    return raw;
  }
  const out = new Uint8Array(raw.length);
  const shift = raw instanceof Uint16Array;
  for (let i = 0; i < raw.length; i += 1) {
    const v = shift ? raw[i] >> 8 : raw[i];
    out[i] = v < 0 ? 0 : v > 255 ? 255 : v;
  }
  return out;
}

export async function parseGeoTiff(
  buffer: ArrayBuffer,
  options: { makePreview?: MakePreview } = {},
): Promise<ParsedGeoTiff> {
  const makePreview = options.makePreview ?? domCanvasPreview;

  let width: number;
  let height: number;
  let geoKeys: GeoKeyBag;
  let directory: GeoTiffDirectory;
  let imageSizes: PixelSize[];
  let getImage: (index: number) => Promise<GeoTIFFImage>;
  try {
    const tiff = await fromArrayBuffer(buffer);
    const count = await tiff.getImageCount();
    // Explicitly typed: `images` is captured by the `getImage` closure below,
    // which defeats TS's "evolving array" inference and leaves it implicitly
    // `any[]` (a real noImplicitAny error under this repo's strict config).
    const images: GeoTIFFImage[] = [];
    for (let i = 0; i < count; i += 1) {
      images.push(await tiff.getImage(i));
    }
    const base = images[0];
    width = base.getWidth();
    height = base.getHeight();
    geoKeys = (base.getGeoKeys() ?? {}) as GeoKeyBag;
    directory = base.getFileDirectory() as GeoTiffDirectory;
    imageSizes = images.map((img) => ({
      width: img.getWidth(),
      height: img.getHeight(),
    }));
    getImage = async (index) => images[index];
  } catch (error) {
    if (error instanceof UserMapImportError) {
      throw error;
    }
    throw new UserMapImportError(
      "corrupt-file",
      "This file could not be read as a GeoTIFF. It may be truncated or corrupt.",
    );
  }

  const pixelIsPoint = geoKeys.GTRasterTypeGeoKey === 2;
  const geotransform = geotransformFrom(directory, pixelIsPoint);
  const crs = crsFrom(geoKeys);
  // A TIFF with no geo tags is not an error any more: it is a scan, and only
  // geotiff.js can decode its pixels, so the preview below still gets built
  // and the caller sends the map to the georeferencer.
  const georef: EmbeddedGeoref | null =
    geotransform && crs ? { kind: "embedded", crs, geotransform } : null;
  if (georef) {
    // An unreadable CRS is still a hard failure: we would be guessing where
    // on Earth the raster belongs. Georeferencing it by hand remains an
    // option, but silently doing that would hide a fixable export mistake.
    validateCrs(georef.crs);
    // A CRS can pass validateCrs yet still be paired with a geotransform
    // whose tiepoint doesn't actually fall inside that CRS's domain (e.g. an
    // out-of-zone UTM tiepoint) — proj4 doesn't throw for that, it silently
    // returns non-finite coordinates (see pixelToLatLng). Project the four
    // raster corners now, at import time, so that failure aborts the import
    // instead of surfacing as triangles stretched across the globe at render
    // time. Nothing to check on the null branch: there is no transform yet.
    for (const [cx, cy] of [
      [0, 0],
      [width, 0],
      [0, height],
      [width, height],
    ] as const) {
      pixelToLatLng(georef, cx, cy); // throws invalid-georeferencing on failure
    }
  }

  const downScale = Math.min(1, PREVIEW_MAX_DIMENSION / Math.max(width, height));
  const previewSize: PixelSize = {
    width: Math.max(1, Math.round(width * downScale)),
    height: Math.max(1, Math.round(height * downScale)),
  };

  const chosenIndex = chooseImageIndex(imageSizes, PREVIEW_MAX_DIMENSION);
  let rgb: Uint8Array;
  try {
    // Decode from the smallest sufficient overview. Note: geotiff still
    // materializes that image's source tiles transiently during the read;
    // the cap bounds the RETAINED output, not the decode peak.
    const source = await getImage(chosenIndex);
    // geotiff's readRGB return type is a union that also covers the
    // non-interleaved (TypedArray[]) shape, because the type doesn't
    // discriminate on the `interleave` option's literal value. We always
    // pass `interleave: true`, so the result is always a single interleaved
    // typed array — verified against geotiff@2.1.3's runtime behavior.
    const raw = (await source.readRGB({
      interleave: true,
      width: previewSize.width,
      height: previewSize.height,
    })) as TypedArrayWithDimensions;
    rgb = toUint8Rgb(raw);
    // readRGB defaults to dropping extra samples. A GDAL hull-clipped RGBA
    // map consequently became an opaque black rectangle outside the hull.
    // Read only a declared alpha sample; an arbitrary fourth band is not alpha.
    const extras = Array.from(source.getFileDirectory().ExtraSamples ?? []) as number[];
    const alphaExtra = extras.findIndex((value) => value === 1 || value === 2);
    if (alphaExtra >= 0) {
      const alphaSample = source.getSamplesPerPixel() - extras.length + alphaExtra;
      const alpha = toUint8Rgb((await source.readRasters({
        samples: [alphaSample], interleave: true,
        width: previewSize.width, height: previewSize.height,
      })) as TypedArrayWithDimensions);
      const rgba = new Uint8Array(previewSize.width * previewSize.height * 4);
      for (let i = 0; i < alpha.length; i += 1) {
        const a = alpha[i];
        // ImageData expects unassociated RGB, even when TIFF stores colours
        // premultiplied by alpha (ExtraSamples=1).
        const factor = extras[alphaExtra] === 1 && a > 0 ? 255 / a : 1;
        for (let channel = 0; channel < 3; channel += 1) {
          rgba[i * 4 + channel] = Math.min(255, Math.round(rgb[i * 3 + channel] * factor));
        }
        rgba[i * 4 + 3] = a;
      }
      rgb = rgba;
    }
  } catch (error) {
    if (error instanceof UserMapImportError) {
      throw error;
    }
    // The cap above bounds the RETAINED preview, not the decode peak: with
    // no overview small enough to cover PREVIEW_MAX_DIMENSION, geotiff still
    // has to materialize the CHOSEN image's full pixel grid before it can
    // down-scale. A valid multi-hundred-megabyte raster with no internal
    // overviews can exhaust the browser's heap right here — well under the
    // 500 MB file-size limit — so telling the user their file is "corrupt"
    // would be a lie. Tell them the truth instead.
    const chosenSize = imageSizes[chosenIndex];
    if (chosenSize.width * chosenSize.height > DECODE_TOO_LARGE_PIXEL_THRESHOLD) {
      throw new UserMapImportError(
        "too-large",
        "This image is too large to decode in the browser, even though the " +
          "file itself is under 500 MB. Add internal overviews (for example " +
          "with gdaladdo) or export a smaller or lower-resolution area, then " +
          "re-import.",
      );
    }
    throw new UserMapImportError(
      "corrupt-file",
      "The image data in this GeoTIFF could not be decoded.",
    );
  }

  const preview = await makePreview(rgb, previewSize.width, previewSize.height);

  return {
    pixelSize: { width, height },
    georef,
    preview,
    previewSize,
  };
}

/** RGB or decoded RGBA → canvas bytes; shared by DOM and worker previews. */
export function rgbToRgba(
  rgb: Uint8Array,
  width: number,
  height: number,
): Uint8ClampedArray<ArrayBuffer> {
  if (rgb.length === width * height * 4) return new Uint8ClampedArray(rgb);
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) {
    rgba[j] = rgb[i];
    rgba[j + 1] = rgb[i + 1];
    rgba[j + 2] = rgb[i + 2];
    rgba[j + 3] = 255;
  }
  return rgba;
}

/** Main-thread fallback preview maker (DOM canvas). Workers use OffscreenCanvas. */
async function domCanvasPreview(
  rgb: Uint8Array,
  width: number,
  height: number,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new UserMapImportError(
      "corrupt-file",
      "This browser could not prepare the map preview.",
    );
  }
  ctx.putImageData(new ImageData(rgbToRgba(rgb, width, height), width, height), 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(
          new UserMapImportError(
            "corrupt-file",
            "This browser could not prepare the map preview.",
          ),
        );
      }
    }, "image/png");
  });
}
