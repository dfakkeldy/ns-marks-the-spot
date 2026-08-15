import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LayerCategorySection } from "./LayerCategorySection";

describe("LayerCategorySection", () => {
  it("uses a controlled disclosure button with a textual summary", async () => {
    const onExpandedChange = vi.fn();
    render(
      <LayerCategorySection
        id="land-property"
        name="Land & Property"
        description="Property, Crown land, buildings, and zoning."
        summary="3 on"
        expanded={false}
        onExpandedChange={onExpandedChange}
      >
        <div>Property controls</div>
      </LayerCategorySection>,
    );

    const button = screen.getByRole("button", {
      name: /Land & Property.*3 on/i,
    });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("region", { name: /Land & Property/i }),
    ).not.toBeInTheDocument();

    await userEvent.click(button);

    expect(onExpandedChange).toHaveBeenCalledWith(true);
  });

  it.each(["Off", "Add", "Unavailable — tile hosting not configured"])(
    "keeps the %s summary in the disclosure's accessible name",
    (summary) => {
      render(
        <LayerCategorySection
          id="historical-maps"
          name="Historical Maps"
          description="Fletcher and Church historical map collections."
          summary={summary}
          expanded={false}
          onExpandedChange={() => undefined}
        >
          <div>Historical controls</div>
        </LayerCategorySection>,
      );

      expect(
        screen.getByRole("button", {
          name: new RegExp(`Historical Maps.*${summary}`, "i"),
        }),
      ).toBeInTheDocument();
    },
  );

  it("labels the expanded content region with its heading button", () => {
    render(
      <LayerCategorySection
        id="roads-places"
        name="Roads & Places"
        description="Roads, trails, place names, and reference routes."
        summary="1 on"
        expanded
        onExpandedChange={() => undefined}
      >
        <div>Road controls</div>
      </LayerCategorySection>,
    );

    const button = screen.getByRole("button", {
      name: /Roads & Places.*1 on/i,
    });
    const region = screen.getByRole("region", { name: /Roads & Places/i });

    expect(region).toHaveAttribute("aria-labelledby", button.id);
    expect(region).toHaveTextContent(
      "Roads, trails, place names, and reference routes.",
    );
    expect(region).toHaveTextContent("Road controls");
  });
});
