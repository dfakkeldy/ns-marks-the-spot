import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  builtInMapThemes,
  type CustomMapThemeDefinition,
} from "../themes/mapThemes";
import type { ThemeComparableState } from "../themes/themeState";
import { ThemeManagerDialog } from "./ThemeManagerDialog";

const customTheme: CustomMapThemeDefinition = {
  id: "custom-field-day",
  kind: "custom",
  name: "Field day",
  description: "A custom map theme.",
  layerIds: ["modern"],
  opacityOverrides: {},
  preferredCategoryIds: ["background-maps"],
  taxSaleEnabled: false,
  mapMode: "current",
};

const currentState: ThemeComparableState = {
  layerIds: ["modern", "roads"],
  opacityOverrides: {},
  taxSaleEnabled: false,
  mapMode: "current",
};

function dialogProps() {
  return {
    themes: [...builtInMapThemes, customTheme],
    currentState,
    preferredCategoryIds: ["roads-places"] as const,
    notice: null,
    onSave: vi.fn(),
    onRename: vi.fn(),
    onUpdate: vi.fn(),
    onDuplicate: vi.fn(),
    onDelete: vi.fn(),
    onClose: vi.fn(),
  };
}

describe("ThemeManagerDialog", () => {
  it("saves the named current setup and excludes built-ins from editable rows", async () => {
    const props = dialogProps();
    render(<ThemeManagerDialog {...props} />);

    expect(
      screen.queryByRole("textbox", { name: /Explore Nova Scotia/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Rename Field day" }))
      .toHaveValue("Field day");

    await userEvent.type(
      screen.getByRole("textbox", { name: "Theme name" }),
      "Field kit",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Save current setup" }),
    );

    expect(props.onSave).toHaveBeenCalledWith("Field kit");
  });

  it("renames, updates, and duplicates the selected custom theme with exact callbacks", async () => {
    const props = dialogProps();
    render(<ThemeManagerDialog {...props} />);

    const row = screen.getByRole("listitem", { name: "Field day theme" });
    const renameInput = within(row).getByRole("textbox", {
      name: "Rename Field day",
    });
    await userEvent.clear(renameInput);
    await userEvent.type(renameInput, "Woodlot");
    await userEvent.click(within(row).getByRole("button", { name: "Rename" }));
    await userEvent.click(
      within(row).getByRole("button", { name: "Update from current setup" }),
    );
    await userEvent.click(
      within(row).getByRole("button", { name: "Duplicate" }),
    );

    expect(props.onRename).toHaveBeenCalledWith("custom-field-day", "Woodlot");
    expect(props.onUpdate).toHaveBeenCalledWith(
      "custom-field-day",
      currentState,
      ["roads-places"],
    );
    expect(props.onDuplicate).toHaveBeenCalledWith("custom-field-day");
  });

  it("requires confirmation before deleting and lets the user cancel deletion", async () => {
    const props = dialogProps();
    render(<ThemeManagerDialog {...props} />);

    const row = screen.getByRole("listitem", { name: "Field day theme" });
    await userEvent.click(within(row).getByRole("button", { name: "Delete" }));
    expect(within(row).getByText("Delete Field day?"))
      .toBeInTheDocument();

    await userEvent.click(
      within(row).getByRole("button", { name: "Keep theme" }),
    );
    expect(props.onDelete).not.toHaveBeenCalled();

    await userEvent.click(within(row).getByRole("button", { name: "Delete" }));
    await userEvent.click(
      within(row).getByRole("button", { name: "Confirm delete" }),
    );
    expect(props.onDelete).toHaveBeenCalledWith("custom-field-day");
  });

  it("announces a repository write failure inside the open manager", () => {
    render(
      <ThemeManagerDialog
        {...dialogProps()}
        notice="Your custom themes could not be saved in this browser."
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Your custom themes could not be saved in this browser.",
    );
  });

  it("closes on Cancel or Escape and returns focus to the opener", async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Manage themes
          </button>
          {open ? (
            <ThemeManagerDialog
              {...dialogProps()}
              onClose={() => setOpen(false)}
            />
          ) : null}
        </>
      );
    }

    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Manage themes" });
    await userEvent.click(opener);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();

    await userEvent.click(opener);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});
