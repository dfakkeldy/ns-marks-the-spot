export type BrowserLocation = {
  latitude: number;
  longitude: number;
  accuracy: number;
};

export function getBrowserLocation(
  geolocation: Geolocation | undefined = navigator.geolocation,
): Promise<BrowserLocation> {
  if (!geolocation) {
    return Promise.reject(new Error("Location is not available in this browser."));
  }

  return new Promise((resolve, reject) => {
    geolocation.getCurrentPosition(
      ({ coords }) => {
        resolve({
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy,
        });
      },
      ({ message }) => reject(new Error(message || "Location permission denied.")),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
    );
  });
}
