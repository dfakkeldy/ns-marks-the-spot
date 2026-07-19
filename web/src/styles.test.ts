// @ts-expect-error Vitest runs in Node; the browser bundle intentionally omits Node types.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync("./src/styles.css", "utf8");

describe("mobile parcel inspector layout", () => {
  it("keeps the inspector within the phone map viewport and scrolls long content", () => {
    const mobileStart = styles.indexOf("@media (max-width: 560px)");
    const mobileEnd = styles.indexOf(
      "@media (prefers-reduced-motion: reduce)",
      mobileStart,
    );
    const mobileStyles = styles.slice(mobileStart, mobileEnd);
    const inspectorDeclarations = mobileStyles.match(
      /\.parcel-inspector\s*\{([^}]*)\}/,
    )?.[1];

    expect(mobileStart).toBeGreaterThanOrEqual(0);
    expect(mobileEnd).toBeGreaterThan(mobileStart);
    expect(inspectorDeclarations).toMatch(/top:\s*10px/);
    expect(inspectorDeclarations).toMatch(/bottom:\s*10px/);
    expect(inspectorDeclarations).toMatch(/overflow-y:\s*auto/);
  });
});
