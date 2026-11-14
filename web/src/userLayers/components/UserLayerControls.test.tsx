import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { probeLayer } from "../probe";
vi.mock("../probe", () => ({ probeLayer: vi.fn() }));
import { UserLayerControls } from "./UserLayerControls";
import type { UserLayerRecord } from "../types";
import { zoningLayerCatalog } from "../../layers/layerCatalog";
import type { useUserLayers } from "../useUserLayers";

describe("your layers controls", () => {
  it("requires terms and clears acknowledgement when the address changes", () => {
    const api = { loaded: true, records: [], state: {}, storageError: false, skippedRecords: 0, save: vi.fn(), remove: vi.fn(), setEnabled: vi.fn(), setOpacity: vi.fn(), visibleLayers: [] } as ReturnType<typeof useUserLayers>;
    render(<UserLayerControls api={api} statuses={{}} licenceAccepted={false} onReviewLicence={vi.fn()} position={{ latitude: 46, longitude: -61, zoom: 10 }} />);
    fireEvent.click(screen.getByRole("button", { name: "Add your own layer" }));
    const add = screen.getByRole("button", { name: "Add" }); expect(add).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Address"), { target: { value: "https://tiles.example.org/{z}/{x}/{y}.png?key=secret" } });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "My map" } });
    fireEvent.change(screen.getByLabelText("Credit line"), { target: { value: "Credit" } });
    fireEvent.change(screen.getByLabelText("Terms"), { target: { value: "Personal use" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /I have read/ })); expect(add).toBeEnabled();
    expect(screen.queryByText(/secret/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Address"), { target: { value: "https://example.org/{z}/{x}/{y}.png" } });
    expect(add).toBeDisabled();
  });
  it("discards a probe after WMS request settings change", async () => {
    let finish!: (value: { display: boolean; corsReadable: boolean; at: string; diagnostic: undefined }) => void;
    vi.mocked(probeLayer).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const api = { loaded: true, records: [], state: {}, storageError: false, skippedRecords: 0, save: vi.fn(), remove: vi.fn(), setEnabled: vi.fn(), setOpacity: vi.fn(), visibleLayers: [] } as ReturnType<typeof useUserLayers>;
    render(<UserLayerControls api={api} statuses={{}} licenceAccepted={true} onReviewLicence={vi.fn()} position={{ latitude: 46, longitude: -61, zoom: 10 }} />);
    fireEvent.click(screen.getByRole("button", { name: "Add your own layer" }));
    fireEvent.change(screen.getByLabelText("Address"), { target: { value: "https://example.org/wms?service=WMS" } });
    fireEvent.change(screen.getByLabelText("WMS layers"), { target: { value: "first" } });
    fireEvent.click(screen.getByRole("button", { name: "Test" }));
    fireEvent.change(screen.getByLabelText("WMS layers"), { target: { value: "second" } });
    await act(async () => finish({ display: true, corsReadable: true, at: "2026-11-14", diagnostic: undefined }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Test" })).toBeEnabled());
    expect(screen.queryByText(/Draws: yes/)).not.toBeInTheDocument();
  });
  it("suspends the editor before opening Province acceptance", () => {
    const api = { loaded: true, records: [], state: {}, storageError: false, skippedRecords: 0, save: vi.fn(), remove: vi.fn(), setEnabled: vi.fn(), setOpacity: vi.fn(), visibleLayers: [] } as ReturnType<typeof useUserLayers>;
    const review = vi.fn();
    render(<UserLayerControls api={api} statuses={{}} licenceAccepted={false} onReviewLicence={review} position={{ latitude: 46, longitude: -61, zoom: 10 }} />);
    fireEvent.click(screen.getByRole("button", { name: "Add your own layer" }));
    fireEvent.change(screen.getByLabelText("Address"), { target: { value: "https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_NSODB_10k_WM84/MapServer" } });
    fireEvent.click(screen.getByRole("button", { name: "Test" }));
    expect(review).toHaveBeenCalledOnce(); expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resume editing layer" })).toBeVisible();
  });
  it("labels user sources, escapes credit, and blocks a municipal source", () => {
    const common = { kind: "xyz", role: "overlay", attribution: "<img src=x onerror=1>", termsNote: "Terms", termsUrl: null, createdAt: "2026-11-14", acknowledgement: { version: 1, at: "2026-11-14" } } as UserLayerRecord;
    const zoning = zoningLayerCatalog.find(layer => layer.id === "zoning-inverness")!;
    const records = [
      { ...common, id: "user-layer:1", name: "Private layer", url: "https://example.org/{z}/{x}/{y}.png?key=private" },
      { ...common, id: "user-layer:2", name: "Aerial", url: "https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_NSODB_10k_WM84/MapServer" },
      { ...common, id: "user-layer:3", name: "Zoning", url: zoning.serviceUrl },
    ];
    const api = { loaded: true, records, state: {}, storageError: false, skippedRecords: 0, save: vi.fn(), remove: vi.fn(), setEnabled: vi.fn(), setOpacity: vi.fn(), visibleLayers: [] } as ReturnType<typeof useUserLayers>;
    const { container } = render(<UserLayerControls api={api} statuses={{}} licenceAccepted={false} onReviewLicence={vi.fn()} position={{ latitude: 46, longitude: -61, zoom: 10 }} />);
    expect(screen.getByText(/Added by you - example.org - not an NS Marks The Spot source/)).toBeVisible();
    expect(screen.getByText(/already offered by NS Marks The Spot as “NS Aerial”/)).toBeVisible();
    expect(screen.getByRole("checkbox", { name: /Zoning Your layer/ })).toBeDisabled();
    expect(screen.queryByText(/key=private/)).not.toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });
  it("tests the normalized ArcGIS address", async () => {
    vi.mocked(probeLayer).mockResolvedValueOnce({ display: true, corsReadable: true, at: "2026-11-14", diagnostic: undefined });
    const api = { loaded: true, records: [], state: {}, storageError: false, skippedRecords: 0, save: vi.fn(), remove: vi.fn(), setEnabled: vi.fn(), setOpacity: vi.fn(), visibleLayers: [] } as ReturnType<typeof useUserLayers>;
    render(<UserLayerControls api={api} statuses={{}} licenceAccepted={true} onReviewLicence={vi.fn()} position={{ latitude: 46, longitude: -61, zoom: 10 }} />);
    fireEvent.click(screen.getByRole("button", { name: "Add your own layer" }));
    fireEvent.change(screen.getByLabelText("Address"), { target: { value: "https://example.org/MapServer/export?key=1" } });
    fireEvent.click(screen.getByRole("button", { name: "Test" }));
    await waitFor(() => expect(vi.mocked(probeLayer)).toHaveBeenCalledWith(expect.objectContaining({ url: "https://example.org/MapServer?key=1" }), true, expect.anything(), 10));
  });

  it("does not promise PDF permission for a readable restricted source", async () => {
    vi.mocked(probeLayer).mockResolvedValueOnce({ display: true, corsReadable: true, at: "2026-11-14", diagnostic: undefined });
    const api = { loaded: true, records: [], state: {}, storageError: false, skippedRecords: 0, save: vi.fn(), remove: vi.fn(), setEnabled: vi.fn(), setOpacity: vi.fn(), visibleLayers: [] } as ReturnType<typeof useUserLayers>;
    render(<UserLayerControls api={api} statuses={{}} licenceAccepted={true} onReviewLicence={vi.fn()} position={{ latitude: 46, longitude: -61, zoom: 10 }} />);
    fireEvent.click(screen.getByRole("button", { name: "Add your own layer" }));
    fireEvent.change(screen.getByLabelText("Address"), { target: { value: "https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_NSODB_10k_WM84/MapServer" } });
    fireEvent.click(screen.getByRole("button", { name: "Test" }));
    expect(await screen.findByText(/PDF export: no/)).toBeVisible();
    expect(screen.getByText(/Export locked/)).toBeVisible();
  });

});
