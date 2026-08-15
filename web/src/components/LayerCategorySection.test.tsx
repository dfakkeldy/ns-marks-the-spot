import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
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
    expect(screen.queryByText("Property controls")).not.toBeInTheDocument();

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

  it("exposes its disclosure button for phone focus restoration", () => {
    const buttonRef = createRef<HTMLButtonElement>();
    render(
      <LayerCategorySection
        id="my-maps"
        name="My Maps"
        description="Import and control your own maps."
        summary="Add"
        expanded={false}
        onExpandedChange={() => undefined}
        buttonRef={buttonRef}
      >
        <div>Map controls</div>
      </LayerCategorySection>,
    );

    expect(buttonRef.current).toBe(screen.getByRole("button", { name: /My Maps.*Add/ }));
  });
});
