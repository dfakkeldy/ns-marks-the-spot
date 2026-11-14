import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import type { UserLayerRecord } from "../types";
import { UserLayerCredits } from "./UserLayerCredits";
it("renders the user credit as text in its own group", () => {
  const record = { id: "user-layer:1", attribution: "<img src=x onerror=1>; Open Government Licence – Nova Scotia." } as UserLayerRecord;
  const { container } = render(<UserLayerCredits layers={[{ record, opacity: 1 }]} />);
  expect(screen.getByText(/^Your layer:/)).toHaveTextContent(record.attribution);
  expect(container.querySelector("img")).toBeNull();
  expect(screen.getByText("Your layers")).toBeVisible();
});
