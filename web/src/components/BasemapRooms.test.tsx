import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BasemapRooms } from "./BasemapRooms";

describe("BasemapRooms", () => {
  it("offers every room as one radio group, with the resolved room checked", () => {
    render(<BasemapRooms preference="system" style="night" onChange={vi.fn()} />);
    const group = screen.getByRole("radiogroup", { name: "Map style" });
    expect(within(group).getAllByRole("radio").map((radio) => radio.getAttribute("value")))
      .toEqual(["day", "night", "fletcher", "handdrawn", "osm"]);
    expect(within(group).getByRole("radio", { name: "Night" })).toBeChecked();
    expect(screen.getByText("Day or Night follows your device.")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("chooses a room, and offers the way back to following the device", async () => {
    const onChange = vi.fn();
    render(<BasemapRooms preference="fletcher" style="fletcher" onChange={onChange} />);
    await userEvent.click(screen.getByRole("radio", { name: "Hand-drawn" }));
    expect(onChange).toHaveBeenLastCalledWith("handdrawn");
    await userEvent.click(screen.getByRole("button", { name: "Follow my device for Day or Night" }));
    expect(onChange).toHaveBeenLastCalledWith("system");
  });
});
