import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
});
