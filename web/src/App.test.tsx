import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { PROVINCE_ATTRIBUTION } from "./licensing/provinceLicense";

vi.mock("./components/MapCanvas", () => ({
  MapCanvas: () => <div data-testid="map-canvas">Map canvas</div>,
}));

vi.mock("./services/nsprd", async (importOriginal) => {
  const original = await importOriginal<typeof import("./services/nsprd")>();
  return {
    ...original,
    fetchParcels: vi.fn().mockResolvedValue({
      type: "FeatureCollection",
      features: [],
    }),
  };
});

describe("NS Marks The Spot Online", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("requires licence acceptance before enabling Province property layers", () => {
    render(<App />);

    expect(
      screen.getByRole("dialog", { name: "Use Nova Scotia property data" }),
    ).toBeInTheDocument();
    expect(screen.getByText(PROVINCE_ATTRIBUTION)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Accept and view parcels" }),
    ).toBeInTheDocument();
  });

  it("reveals the complete privacy-minimized notice after acceptance", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(
      screen.getByRole("button", { name: "Accept and view parcels" }),
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("45 notice entries · 47 PIDs")).toBeInTheDocument();
    expect(screen.getByLabelText("Search by PID")).toBeEnabled();
    expect(screen.queryByText("Assessed owner")).not.toBeInTheDocument();
  });

  it("finds a tax-sale listing by PID without claiming that it is available", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    render(<App />);

    const search = screen.getByLabelText("Search by PID");
    await user.type(search, "50203256");
    await user.click(screen.getByRole("button", { name: "Find parcel" }));

    expect(screen.getByRole("heading", { name: "Highway 19, Mabou" })).toBeInTheDocument();
    expect(screen.getByText("Listed in official notice")).toBeInTheDocument();
    expect(screen.queryByText(/available/i)).not.toBeInTheDocument();
    expect(screen.getByText("$15,529.15")).toBeInTheDocument();
  });

  it("rejects malformed PID searches", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    render(<App />);

    await user.type(screen.getByLabelText("Search by PID"), "5020");
    await user.click(screen.getByRole("button", { name: "Find parcel" }));

    expect(
      screen.getByText("Enter an 8-digit Nova Scotia parcel ID."),
    ).toHaveAttribute("role", "alert");
  });
});
