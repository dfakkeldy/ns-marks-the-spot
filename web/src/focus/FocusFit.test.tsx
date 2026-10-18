import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FocusFit } from "./FocusFit";
import type { FocusBounds } from "./focusDefinition";

const map = vi.hoisted(() => ({ fitBounds: vi.fn() }));
vi.mock("react-leaflet", () => ({ useMap: () => map }));

const rhodena: FocusBounds = [[45.69, -61.52], [45.9, -61.28]];
const elsewhere: FocusBounds = [[45.4, -61.2], [45.7, -60.6]];

describe("FocusFit", () => {
  beforeEach(() => map.fitBounds.mockReset());

  it("waits for a first request", () => {
    render(<FocusFit request={{ revision: 0, bounds: null }} />);
    expect(map.fitBounds).not.toHaveBeenCalled();
  });

  it("fits once per new revision, to that request's bounds", () => {
    const view = render(<FocusFit request={{ revision: 1, bounds: rhodena }} />);
    expect(map.fitBounds).toHaveBeenCalledExactlyOnceWith(rhodena, { padding: [24, 24], animate: false });

    view.rerender(<FocusFit request={{ revision: 1, bounds: rhodena }} />);
    expect(map.fitBounds).toHaveBeenCalledTimes(1);

    view.rerender(<FocusFit request={{ revision: 2, bounds: elsewhere }} />);
    expect(map.fitBounds).toHaveBeenCalledTimes(2);
    expect(map.fitBounds).toHaveBeenLastCalledWith(elsewhere, { padding: [24, 24], animate: false });
  });
});
