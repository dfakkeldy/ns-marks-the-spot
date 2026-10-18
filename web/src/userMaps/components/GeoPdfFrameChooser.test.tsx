import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { VisibleUserMap } from "./UserMapLayers";
import { GeoPdfFrameChooser } from "./GeoPdfFrameChooser";

const map: VisibleUserMap = {
  previewUrl: "blob:page-one",
  opacity: 0.7,
  record: {
    id: "pdf-1",
    name: "USGS sheet",
    source: "geopdf",
    createdAt: "2026-07-28T00:00:00.000Z",
    pixelSize: { width: 4096, height: 3072 },
    georef: { kind: "gcp", method: "affine", gcps: [] },
    pdf: {
      pageNumber: 1,
      pageCount: 2,
      registration: {
        status: "selection-required",
        candidates: [
          {
            id: "main",
            flavor: "measure",
            embeddedLabel: "Map Layers",
            sourceRect: { x: 200, y: 100, width: 3600, height: 2700 },
            gcps: [],
          },
          {
            id: "unnamed",
            flavor: "measure",
            embeddedLabel: null,
            sourceRect: { x: 3000, y: 100, width: 500, height: 400 },
            gcps: [],
          },
        ],
      },
    },
  },
};

describe("GeoPdfFrameChooser", () => {
  it("chooses a frame without invoking georeferencing", async () => {
    const onUseFrame = vi.fn(async () => undefined);
    render(
      <GeoPdfFrameChooser
        map={map}
        onCancel={vi.fn()}
        onUseFrame={onUseFrame}
      />,
    );
    expect(
      screen.getByRole("dialog", { name: /Choose a frame for USGS sheet/ }),
    ).toBeInTheDocument();
    expect(screen.getByAltText("Page 1 of USGS sheet")).toHaveAttribute(
      "src",
      "blob:page-one",
    );
    expect(screen.getByRole("radio", { name: "Map Layers" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Unnamed frame 1" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Use this frame" })).toBeDisabled();

    await userEvent.click(screen.getByRole("radio", { name: "Map Layers" }));
    expect(screen.getByTestId("geopdf-frame-highlight")).toHaveStyle({
      left: "4.8828125%",
      top: "3.2552083333333335%",
    });
    await userEvent.click(screen.getByRole("button", { name: "Use this frame" }));
    expect(onUseFrame).toHaveBeenCalledWith("main", undefined);
  });

  it("re-applies the current frame of an adjusted registration with consent, not a dead button", async () => {
    const onUseFrame = vi.fn(async () => undefined);
    const confirmSpy = vi
      .spyOn(window, "confirm")
      .mockReturnValue(true);
    const baseRegistration = map.record.pdf!.registration;
    if (baseRegistration.status === "manual") {
      throw new Error("fixture must carry candidates");
    }
    const adjusted = {
      ...map.record,
      pdf: {
        ...map.record.pdf!,
        registration: {
          status: "embedded" as const,
          flavor: "measure" as const,
          selection: { kind: "user" as const },
          selectedFrameId: "main",
          selectedLabel: "Map Layers",
          adjusted: true,
          candidates: baseRegistration.candidates,
        },
      },
    };
    render(
      <GeoPdfFrameChooser
        map={{ ...map, record: adjusted }}
        onCancel={vi.fn()}
        onUseFrame={onUseFrame}
      />,
    );
    await userEvent.click(screen.getByRole("radio", { name: /Map Layers/ }));
    await userEvent.click(screen.getByRole("button", { name: /Use this frame/ }));

    // selectPdfFrame refuses ANY apply on an adjusted registration without
    // explicit consent; the old same-frame carve-out sent the unconsented
    // call anyway and its rejection went unhandled.
    expect(confirmSpy).toHaveBeenCalledWith(
      expect.stringMatching(/Re-applying this frame/),
    );
    expect(onUseFrame).toHaveBeenCalledWith("main", {
      replaceAdjustedPoints: true,
    });
    confirmSpy.mockRestore();
  });

  it("closes on Escape", async () => {
    const onCancel = vi.fn();
    render(
      <GeoPdfFrameChooser
        map={map}
        onCancel={onCancel}
        onUseFrame={vi.fn(async () => undefined)}
      />,
    );
    await userEvent.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
