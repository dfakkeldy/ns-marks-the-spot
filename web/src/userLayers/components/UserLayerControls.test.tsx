import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { probeLayer } from "../probe";
vi.mock("../probe", () => ({ probeLayer: vi.fn() }));
import { UserLayerControls } from "./UserLayerControls";
import type { useUserLayers } from "../useUserLayers";

describe("your layers controls", () => {
  it("requires terms and clears acknowledgement when the address changes", () => {
    const api = { loaded: true, records: [], state: {}, storageError: false, save: vi.fn(), remove: vi.fn(), setEnabled: vi.fn(), setOpacity: vi.fn(), visibleLayers: [] } as ReturnType<typeof useUserLayers>;
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
    let finish!: (value: { display: boolean; corsReadable: boolean; at: string }) => void;
    vi.mocked(probeLayer).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const api = { loaded: true, records: [], state: {}, storageError: false, save: vi.fn(), remove: vi.fn(), setEnabled: vi.fn(), setOpacity: vi.fn(), visibleLayers: [] } as ReturnType<typeof useUserLayers>;
    render(<UserLayerControls api={api} statuses={{}} licenceAccepted={true} onReviewLicence={vi.fn()} position={{ latitude: 46, longitude: -61, zoom: 10 }} />);
    fireEvent.click(screen.getByRole("button", { name: "Add your own layer" }));
    fireEvent.change(screen.getByLabelText("Address"), { target: { value: "https://example.org/wms?service=WMS" } });
    fireEvent.change(screen.getByLabelText("WMS layers"), { target: { value: "first" } });
    fireEvent.click(screen.getByRole("button", { name: "Test" }));
    fireEvent.change(screen.getByLabelText("WMS layers"), { target: { value: "second" } });
    await act(async () => finish({ display: true, corsReadable: true, at: "2026-11-14" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Test" })).toBeEnabled());
    expect(screen.queryByText(/Draws: yes/)).not.toBeInTheDocument();
  });
  it("suspends the editor before opening Province acceptance", () => {
    const api = { loaded: true, records: [], state: {}, storageError: false, save: vi.fn(), remove: vi.fn(), setEnabled: vi.fn(), setOpacity: vi.fn(), visibleLayers: [] } as ReturnType<typeof useUserLayers>;
    const review = vi.fn();
    render(<UserLayerControls api={api} statuses={{}} licenceAccepted={false} onReviewLicence={review} position={{ latitude: 46, longitude: -61, zoom: 10 }} />);
    fireEvent.click(screen.getByRole("button", { name: "Add your own layer" }));
    fireEvent.change(screen.getByLabelText("Address"), { target: { value: "https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_NSODB_10k_WM84/MapServer" } });
    fireEvent.click(screen.getByRole("button", { name: "Test" }));
    expect(review).toHaveBeenCalledOnce(); expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resume editing layer" })).toBeVisible();
  });
});
