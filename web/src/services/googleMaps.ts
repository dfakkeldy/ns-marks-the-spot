const PLUS_CODE_ALPHABET = "23456789CFGHJMPQRVWX";
const PLUS_CODE_BASE = PLUS_CODE_ALPHABET.length;
const LATITUDE_PRECISION = 25_000_000;
const LONGITUDE_PRECISION = 8_192_000;
const LATITUDE_GRID_ROWS = 5;
const LONGITUDE_GRID_COLUMNS = 4;
const GRID_CODE_LENGTH = 5;

export type LongitudeLatitude = readonly [longitude: number, latitude: number];

// Full 10-character Open Location Code pair encoding, based on Google's
// public specification: https://github.com/google/open-location-code
export function plusCodeForCoordinates([
  longitude,
  latitude,
]: LongitudeLatitude): string {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new TypeError("Plus Code coordinates must be finite numbers.");
  }

  let latitudeValue = Math.floor(latitude * LATITUDE_PRECISION);
  latitudeValue += 90 * LATITUDE_PRECISION;
  latitudeValue = Math.max(
    0,
    Math.min(180 * LATITUDE_PRECISION - 1, latitudeValue),
  );

  let longitudeValue = Math.floor(longitude * LONGITUDE_PRECISION);
  longitudeValue += 180 * LONGITUDE_PRECISION;
  const longitudeRange = 360 * LONGITUDE_PRECISION;
  longitudeValue =
    ((longitudeValue % longitudeRange) + longitudeRange) % longitudeRange;

  latitudeValue = Math.floor(
    latitudeValue / LATITUDE_GRID_ROWS ** GRID_CODE_LENGTH,
  );
  longitudeValue = Math.floor(
    longitudeValue / LONGITUDE_GRID_COLUMNS ** GRID_CODE_LENGTH,
  );

  const code = new Array<string>(11);
  code[8] = "+";
  code[9] = PLUS_CODE_ALPHABET[latitudeValue % PLUS_CODE_BASE];
  code[10] = PLUS_CODE_ALPHABET[longitudeValue % PLUS_CODE_BASE];
  latitudeValue = Math.floor(latitudeValue / PLUS_CODE_BASE);
  longitudeValue = Math.floor(longitudeValue / PLUS_CODE_BASE);

  for (let index = 6; index >= 0; index -= 2) {
    code[index] = PLUS_CODE_ALPHABET[latitudeValue % PLUS_CODE_BASE];
    code[index + 1] = PLUS_CODE_ALPHABET[longitudeValue % PLUS_CODE_BASE];
    latitudeValue = Math.floor(latitudeValue / PLUS_CODE_BASE);
    longitudeValue = Math.floor(longitudeValue / PLUS_CODE_BASE);
  }

  return code.join("");
}

export function googleMapsDirectionsUrl([
  longitude,
  latitude,
]: LongitudeLatitude): string {
  const parameters = new URLSearchParams({
    api: "1",
    destination: `${latitude},${longitude}`,
    dir_action: "navigate",
  });

  return `https://www.google.com/maps/dir/?${parameters.toString()}`;
}
