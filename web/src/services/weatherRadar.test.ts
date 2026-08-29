import { describe, expect, it } from "vitest";
import { liveConditionsLayerCatalog } from "../layers/layerCatalog";
import {
  parseLatestRadarTime,
  radarCapabilitiesUrl,
  radarObservedLabel,
} from "./weatherRadar";

const radar = liveConditionsLayerCatalog.find(
  (layer) => layer.id === "weather-radar",
);
if (radar === undefined || radar.delivery !== "wms-raster") {
  throw new Error("weather-radar descriptor missing from the catalog");
}

const capabilitiesXml = `<?xml version="1.0" encoding="UTF-8"?>
<WMS_Capabilities xmlns="http://www.opengis.net/wms">
  <Capability>
    <Layer>
      <Name>RADAR_1KM_RRAI</Name>
      <Dimension name="time" units="ISO8601" default="2026-08-29T15:54:00Z" nearestValue="0">2026-08-29T12:54:00Z/2026-08-29T15:54:00Z/PT6M</Dimension>
    </Layer>
  </Capability>
</WMS_Capabilities>`;

describe("radarCapabilitiesUrl", () => {
  it("asks GeoMet for the one-layer capabilities document", () => {
    const url = new URL(radarCapabilitiesUrl(radar));
    expect(url.origin + url.pathname).toBe("https://geo.weather.gc.ca/geomet");
    expect(url.searchParams.get("service")).toBe("WMS");
    expect(url.searchParams.get("version")).toBe("1.3.0");
    expect(url.searchParams.get("request")).toBe("GetCapabilities");
    expect(url.searchParams.get("layer")).toBe("RADAR_1KM_RRAI");
  });
});

describe("parseLatestRadarTime", () => {
  it("reads the newest frame from the time dimension default", () => {
    expect(parseLatestRadarTime(capabilitiesXml)).toBe("2026-08-29T15:54:00Z");
  });

  it("returns null when the document has no time dimension", () => {
    const withoutTime = capabilitiesXml.replace('name="time"', 'name="elevation"');
    expect(parseLatestRadarTime(withoutTime)).toBeNull();
  });

  it("returns null for an unparseable default rather than inventing a frame", () => {
    const invalidDefault = capabilitiesXml.replace(
      'default="2026-08-29T15:54:00Z"',
      'default="not-a-time"',
    );
    expect(parseLatestRadarTime(invalidDefault)).toBeNull();
  });

  it("returns null for a document that is not XML", () => {
    expect(parseLatestRadarTime("<html>service down</html>")).toBeNull();
    expect(parseLatestRadarTime("varnish guru meditation <<<")).toBeNull();
  });
});

describe("radarObservedLabel", () => {
  it("formats an ISO time as a local clock reading", () => {
    // The exact string depends on the runner's timezone; assert shape, not
    // wall-clock value.
    expect(radarObservedLabel("2026-08-29T15:54:00Z")).toMatch(
      /^\d{1,2}:\d{2}/u,
    );
  });

  it("returns null for garbage rather than a fake time", () => {
    expect(radarObservedLabel("not-a-time")).toBeNull();
  });
});
