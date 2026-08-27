import { describe, expect, it } from "vitest";
import { textTooltip } from "./mapTooltip";

describe("textTooltip", () => {
  it("renders markup as visible text rather than elements", () => {
    const node = textTooltip('<img src=x onerror="boom()">');

    expect(node.querySelector("img")).toBeNull();
    expect(node.children).toHaveLength(0);
    expect(node.textContent).toBe('<img src=x onerror="boom()">');
  });

  it("keeps ordinary labels readable", () => {
    // Escaping a string would have shown "R-1 &amp; R-2" to the user; a text
    // node carries the ampersand through untouched.
    expect(textTooltip("R-1 & R-2 — Residential").textContent).toBe(
      "R-1 & R-2 — Residential",
    );
  });
});
