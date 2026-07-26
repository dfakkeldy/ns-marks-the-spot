import { solveAffineFromGcps } from "./transform/affine";
import { buildGcpLatLngMesh, buildTpsLatLngMesh } from "./transform/gcpMesh";
import { buildLatLngMesh, type LatLngPoint } from "./transform/projection";
import { MIN_GCPS_FOR_BENDING_TPS, solveTps } from "./transform/tps";
import type { UserMapRecord } from "./types";

/**
 * Geographic lattice for a saved record, or null when the record cannot be
 * placed yet: fewer than three points, a point cloud too thin to determine a
 * transform, or a solved transform the acceptance gates in `affine.ts`
 * refuse (non-finite, or squashed past MIN_ANISOTROPY_RATIO). A `tps` record
 * adds two refusals of its own — coincident control points and a singular
 * interpolation matrix. Callers treat null as "draw nothing", never as "draw
 * at the origin".
 *
 * THIS, not the georeferencer session, is what every SAVED layer draws
 * through (`UserMapLayers.tsx:133`). The session's own mesh only lives as
 * long as the panel is open, so a `method`-blind version here would show the
 * user a spline while they edit and snap the layer back to an affine the
 * moment they click Done — with the panel's own tests still green.
 *
 * Its own module rather than part of UserMapLayers.tsx: exporting a function
 * from a .tsx file is a react-refresh/only-export-components error here.
 */
export function meshForRecord(record: UserMapRecord): LatLngPoint[][] | null {
  if (record.georef.kind === "embedded") {
    return buildLatLngMesh(record.georef, record.pixelSize);
  }
  if (
    record.georef.method === "tps" &&
    // Below this the spline IS the affine through the same points — measured
    // at 1.317e-9 m worst separation — so the dense lattice buys nothing and
    // costs 8192 clipped full-image draws per redraw in place of 2. A record
    // reaches that state by having a point deleted after the warp was chosen,
    // at which point the toggle is below its gate and the user cannot switch
    // back. See MIN_GCPS_FOR_BENDING_TPS.
    //
    // This does NOT make the fallback path draw something `needsGeoreferencing`
    // calls undrawable. At n = 3 the two solvers agree exactly: `solveTps`'s
    // extra refusals are coincidence (which collapses a 3-point cloud onto a
    // line, so `solveAffine`'s conditioning gate refuses it too) and a singular
    // interpolation system (which at n = 3 reduces to the affine system the
    // destination gate already ran). Were that ever to drift, it drifts safe:
    // the predicate would badge the record, `visibleMaps` would exclude it, and
    // nothing would be drawn — never a mesh the predicate called impossible.
    record.georef.gcps.length >= MIN_GCPS_FOR_BENDING_TPS
  ) {
    // Same ORIGINAL-pixel argument as the affine branch below, and the same
    // reason the lattice is dense: a spline is not affine anywhere, so unlike
    // AFFINE_GRID_SIZE = 1 a single cell cannot represent it.
    const spline = solveTps(record.georef.gcps);
    return spline.ok
      ? buildTpsLatLngMesh(spline.params, record.pixelSize)
      : null;
  }
  // pixelSize is the ORIGINAL raster's size, which is the space GCP pixels
  // live in. solveAffineFromGcps has no size parameter of its own (its rank
  // gate normalises against the point cloud's own extent, not the raster —
  // see affine.ts), but buildGcpLatLngMesh still needs the ORIGINAL pixel
  // extent to evaluate the solved transform at the raster's true corners;
  // passing the preview size here would silently misplace every corner on
  // any scan larger than PREVIEW_MAX_DIMENSION.
  const params = solveAffineFromGcps(record.georef.gcps);
  return params ? buildGcpLatLngMesh(params, record.pixelSize) : null;
}
