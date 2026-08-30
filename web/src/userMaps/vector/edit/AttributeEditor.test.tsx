import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Feature } from "geojson";
import { AttributeEditor } from "./AttributeEditor";

function feature(properties: Record<string, unknown>): Feature {
  return {
    type: "Feature",
    id: "f1",
    geometry: { type: "Point", coordinates: [-63, 45] },
    properties,
  };
}

describe("AttributeEditor", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("lists only non-reserved properties", () => {
    render(
      <AttributeEditor
        feature={feature({
          name: "Gate",
          description: "Locked",
          "nsmts:capturedAt": "2026-08-30T00:00:00.000Z",
          "nsmts:traced": "nsprd-parcel",
          coordinateProperties: { times: [] },
          species: "red spruce",
          "stand-age": 45,
        })}
        onPatch={vi.fn()}
      />,
    );
    expect(screen.getByText("species")).toBeInTheDocument();
    expect(screen.getByText("stand-age")).toBeInTheDocument();
    expect(screen.queryByText("name")).toBeNull();
    expect(screen.queryByText("nsmts:capturedAt")).toBeNull();
    expect(screen.queryByText("nsmts:traced")).toBeNull();
    expect(screen.queryByText("coordinateProperties")).toBeNull();
  });

  it("edits a value as a string, exactly as typed", async () => {
    const user = userEvent.setup();
    const onPatch = vi.fn();
    render(
      <AttributeEditor feature={feature({ species: "spruce" })} onPatch={onPatch} />,
    );
    await user.type(screen.getByDisplayValue("spruce"), "!");
    expect(onPatch).toHaveBeenLastCalledWith({ species: "spruce!" });
  });

  it("shows an imported number editable and patches it back as a string", async () => {
    const user = userEvent.setup();
    const onPatch = vi.fn();
    render(
      <AttributeEditor feature={feature({ "stand-age": 45 })} onPatch={onPatch} />,
    );
    await user.type(screen.getByDisplayValue("45"), "0");
    // The contract: values entered in the app are strings, no coercion.
    expect(onPatch).toHaveBeenLastCalledWith({ "stand-age": "450" });
  });

  it("renders complex values read-only", () => {
    render(
      <AttributeEditor
        feature={feature({ metadata: { source: "survey" } })}
        onPatch={vi.fn()}
      />,
    );
    expect(
      screen.getByText("Complex value — kept as imported."),
    ).toBeInTheDocument();
    expect(screen.queryByDisplayValue(/survey/)).toBeNull();
  });

  it("removes an attribute with an undefined patch", async () => {
    const user = userEvent.setup();
    const onPatch = vi.fn();
    render(
      <AttributeEditor feature={feature({ species: "spruce" })} onPatch={onPatch} />,
    );
    await user.click(
      screen.getByRole("button", { name: "Remove attribute species" }),
    );
    expect(onPatch).toHaveBeenCalledWith({ species: undefined });
  });

  it("adds a new attribute and clears the form", async () => {
    const user = userEvent.setup();
    const onPatch = vi.fn();
    render(<AttributeEditor feature={feature({})} onPatch={onPatch} />);
    await user.type(screen.getByLabelText("New attribute name"), "crew");
    await user.type(screen.getByLabelText("New attribute value"), "A team");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(onPatch).toHaveBeenCalledWith({ crew: "A team" });
    expect(screen.getByLabelText("New attribute name")).toHaveValue("");
  });

  it("refuses reserved and duplicate names inline, without patching", async () => {
    const user = userEvent.setup();
    const onPatch = vi.fn();
    render(
      <AttributeEditor feature={feature({ species: "spruce" })} onPatch={onPatch} />,
    );

    await user.type(screen.getByLabelText("New attribute name"), "nsmts:traced");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(
      screen.getByText("This name is reserved — pick another."),
    ).toBeInTheDocument();

    await user.clear(screen.getByLabelText("New attribute name"));
    await user.type(screen.getByLabelText("New attribute name"), "name");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(
      screen.getByText("This name is reserved — pick another."),
    ).toBeInTheDocument();

    await user.clear(screen.getByLabelText("New attribute name"));
    await user.type(screen.getByLabelText("New attribute name"), "species");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(
      screen.getByText("This attribute already exists — edit it above."),
    ).toBeInTheDocument();

    expect(onPatch).not.toHaveBeenCalled();
  });

  it("keeps markup-bearing values inert", () => {
    render(
      <AttributeEditor
        feature={feature({ note: '<img src=x onerror="pwn()">' })}
        onPatch={vi.fn()}
      />,
    );
    expect(document.querySelector("img")).toBeNull();
    expect(
      screen.getByDisplayValue('<img src=x onerror="pwn()">'),
    ).toBeInTheDocument();
  });
});
