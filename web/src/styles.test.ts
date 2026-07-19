// @ts-expect-error Vitest runs in Node; the browser bundle intentionally omits Node types.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync("./src/styles.css", "utf8");

describe("mobile parcel inspector layout", () => {
  it("keeps long desktop inspectors inside the map viewport", () => {
    const desktopEnd = styles.indexOf("@media (max-width: 860px)");
    const desktopStyles = styles.slice(0, desktopEnd);
    const inspectorDeclarations = desktopStyles.match(
      /\.parcel-inspector\s*\{([^}]*)\}/,
    )?.[1];

    expect(inspectorDeclarations).toMatch(/max-height:\s*calc\(100% - 36px\)/);
    expect(inspectorDeclarations).toMatch(/overflow-y:\s*auto/);
  });

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

  it("wraps long event metadata inside the inspector", () => {
    const factValues = styles.match(/\.parcel-facts dd\s*\{([^}]*)\}/)?.[1];

    expect(factValues).toMatch(/overflow-wrap:\s*anywhere/);
    expect(factValues).toMatch(/max-width:\s*60%/);
  });

  it("gives multi-event controls explicit compact copy styling", () => {
    expect(styles).toMatch(/\.section-intro\s*\{/);
    expect(styles).toMatch(/\.event-row\s*\{/);
    expect(styles).toMatch(/\.source-note\s*\+\s*\.source-note\s*\{/);
  });
});
