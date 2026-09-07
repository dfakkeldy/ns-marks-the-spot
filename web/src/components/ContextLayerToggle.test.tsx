import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ContextLayerToggle } from "./ContextLayerToggle";
import { contextLayerCatalog } from "../layers/contextLayerCatalog";

const layer = contextLayerCatalog.find(({ id }) => id === "transmission-lines")!;
describe("context layer control", () => {
  it("keeps a shared restricted selection disabled until licence acceptance", () => {
    const change = vi.fn(); const review = vi.fn();
    render(<ContextLayerToggle layer={layer} checked licenceAccepted={false}
      status={{ status: "idle" }} onChange={change} onReviewLicence={review} />);
    expect(screen.getByRole("checkbox", { name: layer.name })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: layer.name })).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: `Review Province licence for ${layer.name}` }));
    expect(review).toHaveBeenCalledOnce();
    expect(change).not.toHaveBeenCalled();
    expect(screen.getByText(layer.webCaveat)).toBeInTheDocument();
  });
  it("exposes source, actual licence and legend without obscuring a source failure", () => {
    render(<ContextLayerToggle layer={layer} checked licenceAccepted
      status={{ status: "error" }} onChange={vi.fn()} onReviewLicence={vi.fn()} />);
    fireEvent.click(screen.getByText("Legend & source"));
    expect(screen.getByRole("link", { name: "Official source" })).toHaveAttribute("href", layer.sourceUrl);
    expect(screen.getByRole("link", { name: "Licence" })).toHaveAttribute("href", layer.licenceUrl);
    expect(screen.getByText("Source temporarily unavailable")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: `${layer.name} legend` })).toBeInTheDocument();
  });
});
