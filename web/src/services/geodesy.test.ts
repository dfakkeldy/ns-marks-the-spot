import { describe, expect, it } from "vitest";
import {
  SQUARE_METRES_PER_ACRE,
  formatArea,
  formatDistance,
  pathDistanceMetres,
  polygonAreaSquareMetres,
  type GeoPoint,
} from "./geodesy";

// One degree of arc on Leaflet's sphere (R = 6 371 000 m).
const METRES_PER_DEGREE = (6_371_000 * Math.PI) / 180;

describe("pathDistanceMetres", () => {
  it("measures a degree of longitude along the equator", () => {
    const metres = pathDistanceMetres([
      { lat: 0, lng: 0 },
      { lat: 0, lng: 1 },
    ]);
    expect(metres).toBeCloseTo(METRES_PER_DEGREE, 0);
  });

  it("measures a degree of latitude the same at any longitude", () => {
    const metres = pathDistanceMetres([
      { lat: 45, lng: -61 },
      { lat: 46, lng: -61 },
    ]);
    expect(metres).toBeCloseTo(METRES_PER_DEGREE, 0);
  });

  it("shrinks east-west distance at Nova Scotia's latitude", () => {
    const metres = pathDistanceMetres([
      { lat: 45, lng: -61 },
      { lat: 45, lng: -60 },
    ]);
    // ≈ cos(45°) of an equatorial degree; haversine value, ±5 m.
    expect(Math.abs(metres - 78_626)).toBeLessThan(5);
  });

  it("sums the legs of a multi-point path", () => {
    const a = { lat: 45, lng: -61 };
    const b = { lat: 45.01, lng: -61 };
    const c = { lat: 45.02, lng: -61 };
    expect(pathDistanceMetres([a, b, c])).toBeCloseTo(
      pathDistanceMetres([a, b]) + pathDistanceMetres([b, c]),
      6,
    );
  });

  it("returns zero for fewer than two points", () => {
    expect(pathDistanceMetres([])).toBe(0);
    expect(pathDistanceMetres([{ lat: 45, lng: -61 }])).toBe(0);
  });
});

describe("polygonAreaSquareMetres", () => {
  const oneAcreSquareAt45North = (): GeoPoint[] => {
    const side = Math.sqrt(SQUARE_METRES_PER_ACRE);
    const dLat = side / METRES_PER_DEGREE;
    const dLng = side / (METRES_PER_DEGREE * Math.cos((45 * Math.PI) / 180));
    return [
      { lat: 45, lng: -61 },
      { lat: 45, lng: -61 + dLng },
      { lat: 45 + dLat, lng: -61 + dLng },
      { lat: 45 + dLat, lng: -61 },
    ];
  };

  it("measures a surveyed one-acre square at 45° North", () => {
    const area = polygonAreaSquareMetres(oneAcreSquareAt45North());
    expect(area / SQUARE_METRES_PER_ACRE).toBeCloseTo(1, 2);
  });

  it("is winding-order independent", () => {
    const ring = oneAcreSquareAt45North();
    expect(polygonAreaSquareMetres([...ring].reverse())).toBeCloseTo(
      polygonAreaSquareMetres(ring),
      6,
    );
  });

  it("measures an equator-crossing patch against the analytic band area", () => {
    const area = polygonAreaSquareMetres([
      { lat: -1, lng: 10 },
      { lat: -1, lng: 11 },
      { lat: 1, lng: 11 },
      { lat: 1, lng: 10 },
    ]);
    // Spherical band: R² · Δλ · (sin φ₂ − sin φ₁)
    const expected =
      6_371_000 ** 2 *
      (Math.PI / 180) *
      (Math.sin((1 * Math.PI) / 180) - Math.sin((-1 * Math.PI) / 180));
    expect(area / expected).toBeCloseTo(1, 4);
  });

  it("returns zero for fewer than three points", () => {
    expect(polygonAreaSquareMetres([])).toBe(0);
    expect(
      polygonAreaSquareMetres([
        { lat: 45, lng: -61 },
        { lat: 45.01, lng: -61 },
      ]),
    ).toBe(0);
  });
});

describe("formatting", () => {
  it("formats metres below one kilometre", () => {
    expect(formatDistance(0)).toBe("0 m");
    expect(formatDistance(999.4)).toBe("999 m");
  });

  it("formats kilometres at and above one kilometre", () => {
    expect(formatDistance(1_000)).toBe("1.00 km");
    expect(formatDistance(12_345)).toBe("12.35 km");
  });

  it("formats areas as hectares and acres together", () => {
    expect(formatArea(5 * SQUARE_METRES_PER_ACRE)).toBe("2.02 ha · 5.00 ac");
    expect(formatArea(10_000)).toBe("1.00 ha · 2.47 ac");
  });
});
