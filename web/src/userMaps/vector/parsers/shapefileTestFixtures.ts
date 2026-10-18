/**
 * Minimal ESRI shapefile writer — test fixtures only.
 *
 * A real `.shp` is the only honest input for testing the shapefile reader:
 * the whole point of the phase is that projected coordinates get reprojected
 * and that a missing `.prj` is refused, and neither claim can be tested
 * against a stubbed parser. Point geometry alone is enough to prove both.
 *
 * Format (ESRI Shapefile Technical Description 7-11): a 100-byte header —
 * big-endian file code and length, little-endian version, shape type and
 * bounding box — followed by records, each an 8-byte big-endian header
 * (1-based record number, content length in 16-bit words) plus content.
 */

const HEADER_BYTES = 100;
const POINT_CONTENT_BYTES = 20; // shape type (4) + X (8) + Y (8)
const RECORD_HEADER_BYTES = 8;

export type ProjectedPoint = { x: number; y: number };

export function buildPointShp(points: ProjectedPoint[]): Uint8Array {
  const recordBytes = points.length * (RECORD_HEADER_BYTES + POINT_CONTENT_BYTES);
  const buffer = new ArrayBuffer(HEADER_BYTES + recordBytes);
  const view = new DataView(buffer);

  view.setInt32(0, 9994); // file code, big endian
  view.setInt32(24, (HEADER_BYTES + recordBytes) / 2); // length in 16-bit words
  view.setInt32(28, 1000, true); // version
  view.setInt32(32, 1, true); // shape type: Point

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  view.setFloat64(36, Math.min(...xs), true);
  view.setFloat64(44, Math.min(...ys), true);
  view.setFloat64(52, Math.max(...xs), true);
  view.setFloat64(60, Math.max(...ys), true);

  let offset = HEADER_BYTES;
  points.forEach((point, index) => {
    view.setInt32(offset, index + 1); // record number, big endian, 1-based
    view.setInt32(offset + 4, POINT_CONTENT_BYTES / 2); // content length in words
    view.setInt32(offset + 8, 1, true); // shape type: Point
    view.setFloat64(offset + 12, point.x, true);
    view.setFloat64(offset + 20, point.y, true);
    offset += RECORD_HEADER_BYTES + POINT_CONTENT_BYTES;
  });

  return new Uint8Array(buffer);
}

const DBF_HEADER_BYTES = 32;
const DBF_FIELD_BYTES = 32;
const DBF_TERMINATOR = 0x0d;

/**
 * Minimal dBase III writer — character fields only, enough to prove that a
 * shapefile's attributes reach feature properties.
 */
export function buildDbf(
  fields: string[],
  rows: Array<Record<string, string>>,
  fieldWidth = 16,
): Uint8Array {
  const headerLength = DBF_HEADER_BYTES + fields.length * DBF_FIELD_BYTES + 1;
  const recordLength = 1 + fields.length * fieldWidth; // 1 = deletion flag
  const bytes = new Uint8Array(headerLength + rows.length * recordLength + 1);
  const view = new DataView(bytes.buffer);
  const ascii = (text: string, at: number, width: number) => {
    for (let i = 0; i < width; i += 1) {
      bytes[at + i] = i < text.length ? text.charCodeAt(i) : 0x20;
    }
  };

  bytes[0] = 0x03; // dBase III, no memo
  bytes[1] = 26;
  bytes[2] = 7;
  bytes[3] = 31;
  view.setInt32(4, rows.length, true);
  view.setInt16(8, headerLength, true);
  view.setInt16(10, recordLength, true);

  fields.forEach((name, index) => {
    const at = DBF_HEADER_BYTES + index * DBF_FIELD_BYTES;
    for (let i = 0; i < 11; i += 1) {
      bytes[at + i] = i < name.length ? name.charCodeAt(i) : 0;
    }
    bytes[at + 11] = "C".charCodeAt(0); // character field
    bytes[at + 16] = fieldWidth;
  });
  bytes[DBF_HEADER_BYTES + fields.length * DBF_FIELD_BYTES] = DBF_TERMINATOR;

  rows.forEach((row, rowIndex) => {
    let at = headerLength + rowIndex * recordLength;
    bytes[at] = 0x20; // not deleted
    at += 1;
    for (const field of fields) {
      ascii(row[field] ?? "", at, fieldWidth);
      at += fieldWidth;
    }
  });
  bytes[bytes.length - 1] = 0x1a; // end-of-file marker
  return bytes;
}

/** NAD83 / UTM zone 20N — the projection Nova Scotia government data ships in. */
export const NAD83_UTM20N_WKT =
  'PROJCS["NAD83 / UTM zone 20N",GEOGCS["NAD83",DATUM["North_American_Datum_1983",' +
  'SPHEROID["GRS 1980",6378137,298.257222101]],PRIMEM["Greenwich",0],' +
  'UNIT["degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],' +
  'PARAMETER["latitude_of_origin",0],PARAMETER["central_meridian",-63],' +
  'PARAMETER["scale_factor",0.9996],PARAMETER["false_easting",500000],' +
  'PARAMETER["false_northing",0],UNIT["metre",1],AUTHORITY["EPSG","26920"]]';
