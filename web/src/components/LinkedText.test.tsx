import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LinkedText } from "./LinkedText";

describe("LinkedText", () => {
  it("names a receipt and a plain address without changing either href", () => {
    const { container } = render(<p><LinkedText text="Crown Land (https://data.novascotia.ca/d/3nka-59nz), released 2026-01-01. Receipt: http://localhost:5181/atlas/crown/source.json" /></p>);
    expect(screen.getByRole("link", { name: "Source receipt" })).toHaveAttribute("href", "http://localhost:5181/atlas/crown/source.json");
    expect(screen.getByRole("link", { name: "data.novascotia.ca" })).toHaveAttribute("href", "https://data.novascotia.ca/d/3nka-59nz");
    expect(container.textContent).toBe("Crown Land (data.novascotia.ca), released 2026-01-01. Source receipt");
  });

  it("keeps a sentence's full stop outside the link", () => {
    render(<p><LinkedText text="See https://example.org/a." /></p>);
    expect(screen.getByRole("link", { name: "example.org" })).toHaveAttribute("href", "https://example.org/a");
  });
});
