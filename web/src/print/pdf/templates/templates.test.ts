import { describe, expect, it } from "vitest";
import { pdfTemplates, templateForOrientation } from "./index";
import { mapFrameAspect, templateBlocks } from "./types";

const overlaps = (a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }) =>
  a.x < b.x + b.width && b.x < a.x + a.width &&
  a.y < b.y + b.height && b.y < a.y + a.height;

describe("pdf templates", () => {
  it.each(Object.values(pdfTemplates))("$id blocks stay inside margins", (t) => {
    for (const { name, rect } of templateBlocks(t)) {
      expect.soft(rect.x, `${name} left`).toBeGreaterThanOrEqual(t.margin);
      expect.soft(rect.y, `${name} bottom`).toBeGreaterThanOrEqual(t.margin);
      expect.soft(rect.x + rect.width, `${name} right`)
        .toBeLessThanOrEqual(t.page.width - t.margin);
      expect.soft(rect.y + rect.height, `${name} top`)
        .toBeLessThanOrEqual(t.page.height - t.margin);
    }
  });

  it.each(Object.values(pdfTemplates))("$id blocks never overlap", (t) => {
    const blocks = templateBlocks(t);
    for (let i = 0; i < blocks.length; i += 1) {
      for (let j = i + 1; j < blocks.length; j += 1) {
        expect(
          overlaps(blocks[i].rect, blocks[j].rect),
          `${blocks[i].name} vs ${blocks[j].name}`,
        ).toBe(false);
      }
    }
  });

  it("portrait page is Letter portrait, landscape is Letter landscape", () => {
    expect(pdfTemplates.portrait.page).toEqual({ width: 612, height: 792 });
    expect(pdfTemplates.landscape.page).toEqual({ width: 792, height: 612 });
  });

  it("map frames have usable aspects", () => {
    expect(mapFrameAspect(pdfTemplates.portrait)).toBeCloseTo(556 / 500, 5);
    expect(mapFrameAspect(pdfTemplates.landscape)).toBeCloseTo(736 / 434, 5);
  });

  it("templateForOrientation returns the matching template", () => {
    expect(templateForOrientation("portrait").id).toBe("portrait");
    expect(templateForOrientation("landscape").id).toBe("landscape");
  });
});
