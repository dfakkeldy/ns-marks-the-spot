import { describe, expect, it } from "vitest";
import { UserMapImportError } from "./errors";
import type { UserMapRecord } from "./types";

describe("UserMapImportError", () => {
  it("keeps the user message separate from the developer message", () => {
    const error = new UserMapImportError(
      "too-large",
      "This file is over 500 MB.",
    );
    expect(error.userMessage).toBe("This file is over 500 MB.");
    // The Error message prefixes the code so console/stack output is
    // diagnosable, while userMessage stays clean enough to render.
    expect(error.message).toBe("too-large: This file is over 500 MB.");
  });

  it("is a real Error subclass so instanceof and catch work", () => {
    const error = new UserMapImportError("quota", "Storage is full.");
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(UserMapImportError);
    expect(error.name).toBe("UserMapImportError");
  });

  it("carries the code through a throw/catch round trip", () => {
    try {
      throw new UserMapImportError("unsupported-crs", "Reproject and retry.");
    } catch (caught) {
      expect(caught).toBeInstanceOf(UserMapImportError);
      expect((caught as UserMapImportError).code).toBe("unsupported-crs");
    }
  });

  it("exposes password-protected as a typed user-facing import error", () => {
    const error = new UserMapImportError(
      "password-protected",
      "Unlock and export this PDF before importing it.",
    );
    expect(error.code).toBe("password-protected");
  });

  it("stores complete multi-frame GeoPDF provenance", () => {
    const record: UserMapRecord = {
      id: "map-1",
      name: "USGS map.pdf",
      source: "geopdf",
      createdAt: "2026-07-28T12:00:00.000Z",
      pixelSize: { width: 4096, height: 3166 },
      sourceRect: { x: 221, y: 188, width: 3490, height: 2720 },
      georef: {
        kind: "gcp",
        method: "affine",
        gcps: [
          {
            id: "gcp-1",
            pixel: { x: 221, y: 188 },
            map: { lat: 45, lng: -63 },
          },
          {
            id: "gcp-2",
            pixel: { x: 3711, y: 188 },
            map: { lat: 45, lng: -62 },
          },
          {
            id: "gcp-3",
            pixel: { x: 221, y: 2908 },
            map: { lat: 44, lng: -63 },
          },
        ],
      },
      pdf: {
        pageNumber: 1,
        pageCount: 2,
        registration: {
          status: "embedded",
          flavor: "measure",
          selection: { kind: "user" },
          selectedFrameId: "measure-12",
          selectedLabel: "Map Layers",
          candidates: [],
          adjusted: false,
        },
      },
    };
    expect(record.pdf?.registration.status).toBe("embedded");
  });
});
