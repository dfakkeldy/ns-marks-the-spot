import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { PROVINCE_ATTRIBUTION } from "./licensing/provinceLicense";
import { fetchParcels } from "./services/nsprd";
import { fetchParcelContext } from "./services/parcelContext";

vi.mock("./components/MapCanvas", () => ({
  MapCanvas: ({
    parcels,
    taxSalePids,
    showModernMap,
  }: {
    parcels: { features: unknown[] };
    taxSalePids: Set<string>;
    showModernMap: boolean;
  }) => (
    <div data-testid="map-canvas">
      Map PID count: {taxSalePids.size}; geometry count: {parcels.features.length};
      modern map: {showModernMap ? "on" : "off"}
    </div>
  ),
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

vi.mock("./services/parcelContext", async (importOriginal) => {
  const original = await importOriginal<typeof import("./services/parcelContext")>();
  return {
    ...original,
    fetchParcelContext: vi.fn().mockResolvedValue({ roads: [], water: [] }),
  };
});

describe("NS Marks The Spot Online", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(fetchParcels).mockResolvedValue({
      type: "FeatureCollection",
      features: [],
    });
    vi.mocked(fetchParcelContext).mockResolvedValue({ roads: [], water: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("requires licence acceptance before enabling Province map layers", () => {
    render(<App />);

    expect(
      screen.getByRole("dialog", { name: "Use Nova Scotia map data" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(PROVINCE_ATTRIBUTION)).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Accept and view map layers" }),
    ).toBeInTheDocument();
  });

  it("reveals both privacy-minimized upcoming events after acceptance", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(
      screen.getByRole("button", { name: "Accept and view map layers" }),
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("67 notice entries · 68 PIDs")).toBeInTheDocument();
    expect(screen.getByText("45 notice entries · 47 PIDs")).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: /CBRM.*July 21, 2026/i }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: /Inverness.*August 11, 2026/i }),
    ).toBeChecked();
    expect(screen.getByLabelText("Search by PID")).toBeEnabled();
    expect(screen.getByLabelText("NS Aerial")).toBeEnabled();
    expect(screen.getByLabelText("NS Property Boundaries")).toBeEnabled();
    expect(screen.getByLabelText("Crown Lands")).toBeEnabled();
    expect(screen.getByLabelText("Flood Risk Areas")).toBeEnabled();
    expect(screen.getByLabelText("Waterfalls")).toBeEnabled();
    expect(screen.getByLabelText("Water features")).toBeEnabled();
    expect(screen.getByLabelText("Roads, trails & culverts")).toBeEnabled();
    expect(screen.queryByText("Assessed owner")).not.toBeInTheDocument();
    expect(
      screen.getByText(PROVINCE_ATTRIBUTION, { selector: "footer span" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("Snapshot retrieved July 19, 2026"),
    ).toHaveLength(2);
  });

  it("tells users to verify results once an advertised sale date has passed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-22T12:00:00Z"));
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");

    render(<App />);

    expect(
      screen.getByRole("checkbox", {
        name: /CBRM.*verify results with the municipality/i,
      }),
    ).toBeChecked();
    expect(
      screen.getAllByText("Past sale date — verify results with the municipality."),
    ).not.toHaveLength(0);
    expect(screen.queryByText("CBRM · July 21, 2026 · Upcoming")).not.toBeInTheDocument();
  });

  it("updates an open map when the advertised sale time passes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-21T13:59:30Z"));
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");

    render(<App />);

    expect(
      screen.getByRole("checkbox", {
        name: "CBRM tax sale - July 21, 2026 - Upcoming",
      }),
    ).toBeChecked();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(
      screen.getByRole("checkbox", {
        name: /CBRM.*verify results with the municipality/i,
      }),
    ).toBeChecked();
  });

  it("toggles native-parity Province layers independently", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    render(<App />);

    const crownLands = screen.getByLabelText("Crown Lands");
    const waterfalls = screen.getByLabelText("Waterfalls");

    expect(crownLands).not.toBeChecked();
    expect(waterfalls).not.toBeChecked();

    await user.click(crownLands);
    await user.click(waterfalls);

    expect(crownLands).toBeChecked();
    expect(waterfalls).toBeChecked();
  });

  it("shows the official road-style legend when the road layer is visible", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    render(<App />);

    await user.click(screen.getByLabelText("Roads, trails & culverts"));

    const legend = screen.getByRole("list", { name: "Road type legend" });
    expect(within(legend).getByText("Highway")).toBeInTheDocument();
    expect(within(legend).getByText("Local road")).toBeInTheDocument();
    expect(within(legend).getByText("Resource road")).toBeInTheDocument();
    expect(within(legend).getByText("Trail / track")).toBeInTheDocument();
    expect(within(legend).getByText("Culvert")).toBeInTheDocument();
  });

  it("turns the modern map off independently of Province layers", async () => {
    const user = userEvent.setup();
    render(<App />);

    const modernMap = screen.getByLabelText("Modern map");
    expect(modernMap).toBeChecked();
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "modern map: on",
    );

    await user.click(modernMap);

    expect(modernMap).not.toBeChecked();
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "modern map: off",
    );
  });

  it("collapses and restores the header", async () => {
    const user = userEvent.setup();
    render(<App />);

    const collapse = screen.getByRole("button", { name: "Collapse header" });
    expect(collapse).toHaveAttribute("aria-expanded", "true");

    await user.click(collapse);

    const expand = screen.getByRole("button", { name: "Expand header" });
    expect(expand).toHaveAttribute("aria-expanded", "false");
    expect(expand.closest(".app-shell")).toHaveClass("header-collapsed");

    await user.click(expand);

    expect(
      screen.getByRole("button", { name: "Collapse header" }),
    ).toHaveAttribute("aria-expanded", "true");
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

  it("shows mapped acreage and exact intersecting road and water features", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    vi.mocked(fetchParcels).mockResolvedValueOnce({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { PID: "50334317", "SHAPE.AREA": 111_057.27135 },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [-61.2, 46.4],
                [-61.1, 46.4],
                [-61.1, 46.3],
                [-61.2, 46.3],
                [-61.2, 46.4],
              ],
            ],
          },
        },
      ],
    });
    vi.mocked(fetchParcelContext).mockResolvedValueOnce({
      roads: [
        { name: "Cabot Trail", kind: "Arterial" },
        { name: "Culvert", kind: "Non-vehicle feature" },
      ],
      water: [{ name: "Mabou River", kind: "River or stream" }],
    });
    render(<App />);

    await user.type(screen.getByLabelText("Search by PID"), "50334317");
    await user.click(screen.getByRole("button", { name: "Find parcel" }));

    const inspector = await screen.findByRole("complementary", {
      name: "Parcel 50334317 details",
    });
    expect(within(inspector).getByText("27.44 acres")).toBeInTheDocument();
    expect(within(inspector).getByText("Cabot Trail")).toBeInTheDocument();
    expect(within(inspector).getByText("Arterial")).toBeInTheDocument();
    expect(within(inspector).getByText("Culvert")).toBeInTheDocument();
    expect(within(inspector).getByText("Mabou River")).toBeInTheDocument();
    expect(within(inspector).getByText("River or stream")).toBeInTheDocument();
  });

  it("reports intersection lookup failures without hiding parcel facts", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    vi.mocked(fetchParcels).mockResolvedValueOnce({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { PID: "50203256", "SHAPE.AREA": 728.4341 },
          geometry: { type: "Point", coordinates: [-61, 46] },
        },
      ],
    });
    vi.mocked(fetchParcelContext).mockRejectedValueOnce(new Error("offline"));
    render(<App />);

    await user.type(screen.getByLabelText("Search by PID"), "50203256");
    await user.click(screen.getByRole("button", { name: "Find parcel" }));

    expect(await screen.findByText("0.18 acres")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Mapped road and water intersections are unavailable right now.",
      ),
    ).toBeInTheDocument();
  });

  it("finds a CBRM listing and shows event-aware municipal details", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    render(<App />);

    await user.type(screen.getByLabelText("Search by PID"), "15054588");
    await user.click(screen.getByRole("button", { name: "Find parcel" }));

    expect(
      screen.getByRole("heading", {
        name: "75 DORCHESTER ST LAND BUILDING",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Cape Breton Regional Municipality")).toBeInTheDocument();
    expect(
      within(screen.getByRole("complementary", { name: "Parcel 15054588 details" })).getByText(
        "July 21, 2026 · Upcoming",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("$33,108.73")).toBeInTheDocument();
    expect(
      screen.queryByText("Immediate deed", { exact: false }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Six-month redemption", { exact: false })).toBeInTheDocument();
    expect(screen.queryByText(/available/i)).not.toBeInTheDocument();
  });

  it("toggles upcoming events without mixing their PID counts", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    render(<App />);

    expect(screen.getByTestId("map-canvas")).toHaveTextContent("Map PID count: 115");
    await user.click(
      screen.getByRole("checkbox", { name: /Inverness.*August 11, 2026/i }),
    );
    expect(screen.getByTestId("map-canvas")).toHaveTextContent("Map PID count: 68");
  });

  it("keeps NSPRD failures visible without manufacturing geometry", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchParcels).mockRejectedValueOnce(new Error("offline"));
    render(<App />);

    await user.click(
      screen.getByRole("button", { name: "Accept and view map layers" }),
    );

    expect(
      await screen.findByText(
        "The Province parcel service is temporarily unavailable. The official notices remain accessible.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId("map-canvas")).toHaveTextContent("geometry count: 0");
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
