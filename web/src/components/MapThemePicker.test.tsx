import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  builtInMapThemes,
  type CustomMapThemeDefinition,
} from "../themes/mapThemes";
import { MapThemePicker } from "./MapThemePicker";

const customTheme: CustomMapThemeDefinition = {
  id: "custom-field-day",
  kind: "custom",
  name: "Field day",
  description: "A custom map theme.",
  layerIds: ["modern", "roads"],
  opacityOverrides: {},
  preferredCategoryIds: ["roads-places"],
  taxSaleEnabled: false,
  mapMode: "current",
};

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
        onSave={() => {}}
        onManage={() => {}}
        onReset={() => {}}
      />,
    );

    await userEvent.selectOptions(
      screen.getByLabelText("Change setup"),
      "historical-maps",
    );

    expect(onSelect).toHaveBeenCalledWith("historical-maps");
    expect(screen.getByRole("status")).toHaveTextContent("Explore Nova Scotia");
    expect(screen.getByText(builtInMapThemes[0].description)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reset/i })).not.toBeInTheDocument();
  });

  it("offers task setups as chips under Explore, and only there", async () => {
    const onSelect = vi.fn();
    const props = {
      themes: builtInMapThemes,
      status: "exact" as const,
      notice: null,
      onSelect,
      onSave: () => {},
      onManage: () => {},
      onReset: () => {},
    };
    const { rerender } = render(<MapThemePicker {...props} activeThemeId="explore-nova-scotia" />);

    const chips = within(screen.getByRole("group", { name: "Start a task" })).getAllByRole("button");
    expect(chips.map((chip) => chip.textContent)).toEqual(["Tax sale", "Forestry", "Historical", "Fishing", "Electoral"]);
    await userEvent.click(screen.getByRole("button", { name: "Fishing" }));
    expect(onSelect).toHaveBeenCalledWith("fishing");

    rerender(<MapThemePicker {...props} activeThemeId="fishing" />);
    expect(screen.queryByRole("group", { name: "Start a task" })).not.toBeInTheDocument();
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
        onSave={() => {}}
        onManage={() => {}}
        onReset={onReset}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Your changes",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Reset setup" }),
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
        onSave={() => {}}
        onManage={() => {}}
        onReset={() => {}}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      /Historical Maps — Partially applied.*Fletcher historical map.*Place Names.*Main Roads/i,
    );
    expect(
      screen.getByRole("button", { name: "Reset setup" }),
    ).toBeInTheDocument();
  });

  it("renders built-in and custom themes in separate groups and announces modification", async () => {
    const onSelect = vi.fn();
    render(
      <MapThemePicker
        themes={[...builtInMapThemes, customTheme]}
        activeThemeId="custom-field-day"
        status="modified"
        notice={null}
        onSelect={onSelect}
        onSave={() => {}}
        onManage={() => {}}
        onReset={() => {}}
      />,
    );

    expect(screen.getByLabelText("Change setup")).toHaveValue("custom-field-day");
    expect(screen.getByRole("status")).toHaveTextContent("Your changes");
    expect(
      within(screen.getByRole("group", { name: "Built-in setups" }))
        .getByRole("option", { name: "Explore Nova Scotia" }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("group", { name: "My setups" }))
        .getByRole("option", { name: "Field day" }),
    ).toBeInTheDocument();

    await userEvent.selectOptions(
      screen.getByLabelText("Change setup"),
      "explore-nova-scotia",
    );
    expect(onSelect).toHaveBeenCalledWith("explore-nova-scotia");
  });

  it("offers manage only once a custom setup exists", async () => {
    const onManage = vi.fn();
    const { rerender } = render(
      <MapThemePicker
        themes={builtInMapThemes}
        activeThemeId="explore-nova-scotia"
        status="exact"
        notice={null}
        onSelect={() => {}}
        onSave={() => {}}
        onManage={onManage}
        onReset={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Save setup…" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "My setups" })).not.toBeInTheDocument();

    rerender(
      <MapThemePicker
        themes={[...builtInMapThemes, customTheme]}
        activeThemeId="explore-nova-scotia"
        status="exact"
        notice={null}
        onSelect={() => {}}
        onSave={() => {}}
        onManage={onManage}
        onReset={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "My setups" }));
    expect(onManage).toHaveBeenCalledOnce();
  });

  it("always offers save but reserves reset for modified or partial setups", async () => {
    const onSave = vi.fn();
    const onManage = vi.fn();
    const { rerender } = render(
      <MapThemePicker
        themes={[...builtInMapThemes, customTheme]}
        activeThemeId="explore-nova-scotia"
        status="exact"
        notice={null}
        onSelect={() => {}}
        onSave={onSave}
        onManage={onManage}
        onReset={() => {}}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Save setup…" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "My setups" }));
    expect(onSave).toHaveBeenCalledOnce();
    expect(onManage).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: /reset/i })).not.toBeInTheDocument();

    rerender(
      <MapThemePicker
        themes={builtInMapThemes}
        activeThemeId="explore-nova-scotia"
        status="partial"
        notice={null}
        onSelect={() => {}}
        onSave={onSave}
        onManage={onManage}
        onReset={() => {}}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Reset setup" }),
    ).toBeInTheDocument();
  });

  it("keeps a temporary Shared setup option for controlled unmatched state", () => {
    render(
      <MapThemePicker
        themes={[...builtInMapThemes, customTheme]}
        activeThemeId={null}
        status="shared"
        notice={null}
        onSelect={() => {}}
        onSave={() => {}}
        onManage={() => {}}
        onReset={() => {}}
      />,
    );

    expect(screen.getByLabelText("Change setup")).toHaveValue("shared");
    expect(
      screen.getByRole("option", { name: "Shared setup" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Shared setup");
  });

  it("says what a chip does, and keeps one way back to Explore on other setups", async () => {
    const onSelect = vi.fn();
    const themes = [
      { id: "explore-nova-scotia", name: "Explore Nova Scotia", kind: "built-in" },
      { id: "fishing", name: "Fishing", kind: "built-in" },
    ] as unknown as Parameters<typeof MapThemePicker>[0]["themes"];
    const shared = { themes, status: "exact" as const, notice: null, onSelect, onSave: vi.fn(), onManage: vi.fn(), onReset: vi.fn() };
    const { rerender } = render(<MapThemePicker {...shared} activeThemeId="explore-nova-scotia" layerSummary="2 layers on" />);
    expect(screen.getByText("Open a setup for a task:")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fishing" })).toHaveAttribute("title", "Open the Fishing setup");
    expect(screen.getByRole("button", { name: "Fishing" })).not.toHaveAttribute("aria-pressed");
    expect(screen.getByText("2 layers on")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back to Explore" })).not.toBeInTheDocument();

    rerender(<MapThemePicker {...shared} activeThemeId="fishing" />);
    await userEvent.click(screen.getByRole("button", { name: "Back to Explore" }));
    expect(onSelect).toHaveBeenCalledWith("explore-nova-scotia");
  });
});
