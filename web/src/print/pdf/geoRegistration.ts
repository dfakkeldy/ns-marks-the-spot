import { PDFHexString, PDFName, type PDFDocument, type PDFPage } from "pdf-lib";
import type { PrintMapBounds } from "../../services/printSnapshot";
import { toMercator } from "../../userMaps/transform/webMercator";
import type { PdfRect } from "./templates/types";

const WEB_MERCATOR_WKT =
  'PROJCS["WGS 84 / Pseudo-Mercator",GEOGCS["WGS 84",DATUM["WGS_1984",' +
  'SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],' +
  'UNIT["degree",0.0174532925199433]],PROJECTION["Mercator_1SP"],' +
  'PARAMETER["central_meridian",0],PARAMETER["scale_factor",1],' +
  'PARAMETER["latitude_of_origin",0],PARAMETER["false_easting",0],' +
  'PARAMETER["false_northing",0],UNIT["metre",1],' +
  'AUTHORITY["EPSG","3857"]]';

/**
 * Stamps both GeoPDF registration flavours onto `page` for the map image
 * occupying `mapFrame`. The CRS is EPSG:3857 because the composited raster
 * IS Web Mercator: declaring the raster's own projection makes the
 * pixel-to-map relation affine-exact at every pixel. GPTS corner values are
 * WGS 84 latitude/longitude, per ISO 32000-2. Both dictionaries are written
 * as direct objects — the app's own parser skips unresolved indirect refs.
 */
export function attachGeoRegistration(
  document: PDFDocument,
  page: PDFPage,
  bounds: PrintMapBounds,
  mapFrame: PdfRect,
): void {
  const left = mapFrame.x;
  const bottom = mapFrame.y;
  const right = mapFrame.x + mapFrame.width;
  const top = mapFrame.y + mapFrame.height;

  // ISO 32000 /Measure + /VP. LPTS corners run SW, NW, NE, SE in the
  // viewport's unit square (v=0 at the bottom); GPTS pairs are (lat, lng).
  const measure = document.context.obj({
    Type: "Measure",
    Subtype: "GEO",
    Bounds: [0, 0, 0, 1, 1, 1, 1, 0],
    LPTS: [0, 0, 0, 1, 1, 1, 1, 0],
    GPTS: [
      bounds.south, bounds.west,
      bounds.north, bounds.west,
      bounds.north, bounds.east,
      bounds.south, bounds.east,
    ],
    GCS: {
      Type: "PROJCS",
      EPSG: 3857,
      WKT: PDFHexString.fromText(WEB_MERCATOR_WKT),
    },
  });
  const viewport = document.context.obj({
    Type: "Viewport",
    BBox: [left, bottom, right, top],
    Name: PDFHexString.fromText("Map frame"),
    Measure: measure,
  });
  page.node.set(PDFName.of("VP"), document.context.obj([viewport]));

  // OGC Best Practice /LGIDict. The CTM maps PDF points to EPSG:3857
  // metres; the neatline is the map frame as an explicitly closed ring
  // (the GeoPDF spike recorded GDAL's "Non closed ring" warning for
  // open-ring producers — this writer closes it).
  const mercNorthWest = toMercator({ lat: bounds.north, lng: bounds.west });
  const mercSouthEast = toMercator({ lat: bounds.south, lng: bounds.east });
  const scaleX = (mercSouthEast.x - mercNorthWest.x) / mapFrame.width;
  const scaleY = (mercNorthWest.y - mercSouthEast.y) / mapFrame.height;
  const lgi = document.context.obj({
    Type: "LGIDict",
    Version: PDFHexString.fromText("2.1"),
    Description: PDFHexString.fromText("Map frame"),
    CTM: [
      scaleX, 0, 0, scaleY,
      mercNorthWest.x - scaleX * left,
      mercSouthEast.y - scaleY * bottom,
    ],
    Neatline: [
      left, bottom, left, top, right, top, right, bottom, left, bottom,
    ],
    Projection: {
      Type: "Projection",
      ProjectionType: "MC",
      Datum: "WGE",
      Units: "m",
      CentralMeridian: 0,
      OriginLatitude: 0,
      FalseEasting: 0,
      FalseNorthing: 0,
      ScaleFactor: 0,
    },
  });
  page.node.set(PDFName.of("LGIDict"), document.context.obj([lgi]));
}
