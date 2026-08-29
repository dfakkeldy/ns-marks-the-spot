import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { provinceLayerCatalog } from "../layers/layerCatalog";
import { LayerToggle } from "./LayerRows";

const aerial = provinceLayerCatalog.find(({ id }) => id === "ns-aerial");
const nsprd = provinceLayerCatalog.find(({ id }) => id === "nsprd");
const idleStatus = { status: "idle" as const };

if (!aerial || !nsprd) {
  throw new Error("Expected NS Aerial and NSPRD in the province layer catalog.");
}

describe("LayerToggle licence review", () => {
  it("offers Review on NS Aerial while the Province licence is outstanding", async () => {
    const onReviewLicence = vi.fn();
    render(
      <LayerToggle
        layer={aerial}
        checked={false}
        licenceAccepted={false}
        status={idleStatus}
        onChange={() => undefined}
        onReviewLicence={onReviewLicence}
      />,
    );

    const toggle = screen.getByLabelText("NS Aerial");
    expect(toggle).toBeDisabled();
    expect(toggle).not.toBeChecked();
    expect(screen.getByText("Province licence required")).toBeInTheDocument();

    await userEvent.click(
      within(toggle.closest("label") as HTMLElement).getByRole("button", {
        name: "Review Province licence for NS Aerial",
      }),
    );
    expect(onReviewLicence).toHaveBeenCalledTimes(1);
  });

  it("keeps NSPRD Review on the same unlicensed path", async () => {
    const onReviewLicence = vi.fn();
    render(
      <LayerToggle
        layer={nsprd}
        checked={false}
        licenceAccepted={false}
        status={idleStatus}
        onChange={() => undefined}
        onReviewLicence={onReviewLicence}
      />,
    );

    const toggle = screen.getByLabelText("NS Property Boundaries");
    expect(toggle).toBeDisabled();

    await userEvent.click(
      within(toggle.closest("label") as HTMLElement).getByRole("button", {
        name: "Review Province licence for NS Property Boundaries",
      }),
    );
    expect(onReviewLicence).toHaveBeenCalledTimes(1);
  });

  it("hides Review and enables the aerial switch after the licence is accepted", () => {
    render(
      <LayerToggle
        layer={aerial}
        checked={false}
        licenceAccepted
        status={idleStatus}
        onChange={() => undefined}
        onReviewLicence={() => undefined}
      />,
    );

    const toggle = screen.getByLabelText("NS Aerial");
    expect(toggle).toBeEnabled();
    expect(toggle).not.toBeChecked();
    expect(screen.getByText("Online imagery · zoom 10+")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Review Province licence for NS Aerial",
      }),
    ).not.toBeInTheDocument();
  });
});
