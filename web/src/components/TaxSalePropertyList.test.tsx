import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { TaxSaleListing } from "../data/taxSaleCatalog";
import { TaxSalePropertyList } from "./TaxSalePropertyList";

const listing: TaxSaleListing = {
  eventId: "cbrm-2026-07-21",
  recordId: "cbrm-1",
  lien: "26-01",
  pids: ["15234636"],
  addressOrDescription: "16 Centre Street",
  location: "Reserve Mines",
  financial: { kind: "minimum-bid", label: "Minimum bid", amountCents: 100_00 },
  redemptionCategory: "six-month",
  redemptionLabel: "Six months",
  listingStatus: "advertised",
};

describe("TaxSalePropertyList", () => {
  it("collapses the long result list after a parcel is selected", async () => {
    const user = userEvent.setup();
    const onSelectPid = vi.fn();
    const { rerender } = render(
      <TaxSalePropertyList
        eventId="cbrm-2026-07-21"
        municipality="CBRM"
        listings={[listing]}
        selectedPid={null}
        disabled={false}
        onSelectPid={onSelectPid}
      />,
    );

    await user.click(screen.getByText("Browse properties"));
    expect(screen.getByText("Choose a property to zoom to its parcel and open the notice details."))
      .toBeVisible();
    await user.click(screen.getByRole("button", { name: /16 Centre Street/i }));

    rerender(
      <TaxSalePropertyList
        eventId="cbrm-2026-07-21"
        municipality="CBRM"
        listings={[listing]}
        selectedPid="15234636"
        disabled={false}
        onSelectPid={onSelectPid}
      />,
    );

    expect(screen.getByText("Choose a property to zoom to its parcel and open the notice details."))
      .not.toBeVisible();
  });

  it("labels a withdrawn parcel without removing its notice record", async () => {
    const user = userEvent.setup();
    render(
      <TaxSalePropertyList
        eventId="inverness-county-2026-08-11"
        municipality="Inverness County"
        listings={[{ ...listing, listingStatus: "withdrawn" }]}
        selectedPid={null}
        disabled={false}
        onSelectPid={vi.fn()}
      />,
    );

    await user.click(screen.getByText("Browse properties"));
    expect(
      screen.getByText("Withdrawn in current notice revision"),
    ).toBeVisible();
  });
});
