import type { FishingSpot } from "./data";

/** Five decimals: about a metre, the most a placed pin can claim. */
export function spotCoordinates(spot: Pick<FishingSpot, "latitude" | "longitude">): string {
  return `${spot.latitude.toFixed(5)}, ${spot.longitude.toFixed(5)}`;
}

/** Directions to the pin only: no starting point is sent. */
export function directionsLinks(spot: Pick<FishingSpot, "latitude" | "longitude">) {
  const destination = `${spot.latitude.toFixed(5)},${spot.longitude.toFixed(5)}`;
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`,
    apple: `https://maps.apple.com/?daddr=${encodeURIComponent(destination)}`,
  };
}
