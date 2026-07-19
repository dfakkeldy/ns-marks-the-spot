import { describe, expect, it } from "vitest";
import { arcGISExportUrlForTile, webMercatorBoundsForTile } from "./arcGISExport";

describe("ArcGIS export tile adapter", () => {
  it("calculates the Web Mercator bounds for a slippy-map tile", () => {
    expect(webMercatorBoundsForTile({ x: 0, y: 0, z: 0 })).toEqual({
      minX: -20_037_508.342789244,
      minY: -20_037_508.342789244,
      maxX: 20_037_508.342789244,
      maxY: 20_037_508.342789244,
    });
  });

  it("builds a direct transparent ArcGIS export image request", () => {
    const url = new URL(
      arcGISExportUrlForTile(
        {
          serviceUrl: "https://example.com/arcgis/rest/services/test/MapServer",
          transparent: true,
          layers: "show:24,25,26",
        },
        { x: 676, y: 724, z: 11 },
      ),
    );

    expect(url.pathname).toBe(
      "/arcgis/rest/services/test/MapServer/export",
    );
    expect(url.searchParams.get("bboxSR")).toBe("3857");
    expect(url.searchParams.get("imageSR")).toBe("3857");
    expect(url.searchParams.get("size")).toBe("256,256");
    expect(url.searchParams.get("format")).toBe("png32");
    expect(url.searchParams.get("transparent")).toBe("true");
    expect(url.searchParams.get("f")).toBe("image");
    expect(url.searchParams.get("layers")).toBe("show:24,25,26");
  });

  it("minifies and forwards native dynamic-layer JSON", () => {
    const dynamicLayers = `
      [{
        "id": 1,
        "source": { "type": "mapLayer", "mapLayerId": 1 }
      }]
    `;
    const url = new URL(
      arcGISExportUrlForTile(
        {
          serviceUrl: "https://example.com/MapServer/",
          transparent: false,
          dynamicLayers,
        },
        { x: 0, y: 0, z: 0 },
      ),
    );

    expect(url.pathname).toBe("/MapServer/export");
    expect(url.searchParams.get("transparent")).toBe("false");
    expect(url.searchParams.get("dynamicLayers")).toBe(
      '[{"id":1,"source":{"type":"mapLayer","mapLayerId":1}}]',
    );
  });
});
