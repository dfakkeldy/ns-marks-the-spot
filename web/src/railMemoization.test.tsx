import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps, ComponentType } from "react";
import { memo } from "react";

/**
 * Counts REAL renders of the rail's LayerToggle across unrelated App
 * updates. The count must happen inside the memo boundary, so the mock
 * unwraps the real memoized export (React.memo exposes the inner component
 * as `.type`) and re-wraps it with a counter in between — anything outside
 * the boundary would be re-invoked by every parent render and prove
 * nothing.
 */
const renderCounts = vi.hoisted(() => ({ layerToggle: 0 }));

vi.mock("./components/LayerRows", async (importOriginal) => {
  const original = await importOriginal<typeof import("./components/LayerRows")>();
  const InnerLayerToggle = (
    original.LayerToggle as unknown as {
      type: ComponentType<ComponentProps<typeof original.LayerToggle>>;
    }
  ).type;
  const CountingLayerToggle = memo(function LayerToggle(
    props: ComponentProps<typeof original.LayerToggle>,
  ) {
    renderCounts.layerToggle += 1;
    return <InnerLayerToggle {...props} />;
  });
  return { ...original, LayerToggle: CountingLayerToggle };
});

vi.mock("./components/MapCanvas", async (importOriginal) => {
  const original = await importOriginal<typeof import("./components/MapCanvas")>();
  return {
    ...original,
    MapCanvas: () => <div data-testid="map-canvas" />,
  };
});

import { App } from "./App";
import { layerCategories } from "./layers/layerCategories";

beforeEach(() => {
  renderCounts.layerToggle = 0;
  localStorage.clear();
  localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
  window.history.replaceState(null, "", "/");
});

describe("rail memoization", () => {
  it("does not re-render layer rows for unrelated App state, and re-renders exactly one for its own toggle", async () => {
    const user = userEvent.setup();
    render(<App />);
    for (const { name } of layerCategories) {
      const toggle = screen.queryByRole("button", { name });
      if (toggle?.getAttribute("aria-expanded") === "false") {
        await user.click(toggle);
      }
    }
    await screen.findAllByLabelText("NS Aerial");
    const afterMount = renderCounts.layerToggle;
    expect(afterMount).toBeGreaterThan(0);

    // A keystroke re-renders the entire App (query state). Before the rows
    // were memoized with identity-stable handlers, every keystroke
    // re-rendered every row.
    await user.type(
      screen.getByLabelText("Search by PID or civic address"),
      "5029",
    );
    expect(renderCounts.layerToggle).toBe(afterMount);

    // A row's own toggle re-renders that row — and only that row.
    await user.click(screen.getByLabelText("NS Aerial"));
    expect(renderCounts.layerToggle).toBe(afterMount + 1);
  });
});
