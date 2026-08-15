import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { builtInMapThemes } from "../themes/mapThemes";
import { MapThemePicker } from "./MapThemePicker";

describe("MapThemePicker", () => {
  it("selects a built-in setup and announces its exact status", async () => {
    const onSelect = vi.fn();
    render(
      <MapThemePicker
        themes={builtInMapThemes}
        activeThemeId="explore-nova-scotia"
        status="exact"
        notice={null}
        onSelect={onSelect}
        onReset={() => {}}
      />,
    );

    await userEvent.selectOptions(
      screen.getByLabelText("Map setup"),
      "historical-maps",
    );

    expect(onSelect).toHaveBeenCalledWith("historical-maps");
    expect(screen.getByRole("status")).toHaveTextContent("Explore Nova Scotia");
    expect(screen.getByText(builtInMapThemes[0].description)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reset/i })).not.toBeInTheDocument();
  });

  it("offers reset for a modified built-in setup", async () => {
    const onReset = vi.fn();
    render(
      <MapThemePicker
        themes={builtInMapThemes}
        activeThemeId="explore-nova-scotia"
        status="modified"
        notice={null}
        onSelect={() => {}}
        onReset={onReset}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Explore Nova Scotia — Modified",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Reset current setup" }),
    );
    expect(onReset).toHaveBeenCalledOnce();
  });

  it("announces a partial setup and its unavailable-layer notice", () => {
    render(
      <MapThemePicker
        themes={builtInMapThemes}
        activeThemeId="historical-maps"
        status="partial"
        notice="Unavailable: Fletcher historical map. Licence required: Place Names, Main Roads."
        onSelect={() => {}}
        onReset={() => {}}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      /Historical Maps — Partially applied.*Fletcher historical map.*Place Names.*Main Roads/i,
    );
    expect(
      screen.getByRole("button", { name: "Reset current setup" }),
    ).toBeInTheDocument();
  });
});
