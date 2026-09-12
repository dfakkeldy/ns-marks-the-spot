import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MailingAddressDetails } from "./MailingAddressDetails";
import { enrichCivicAddresses, type MailingCivicAddress } from "../services/mailingAddresses";
import type { CivicAddress } from "../services/civicAddresses";
vi.mock("../services/mailingAddresses", async original => ({
  ...await original<typeof import("../services/mailingAddresses")>(), enrichCivicAddresses:vi.fn(),
}));
const address = {pntid:"fixture",label:"12 Example Rd, Civic Village",coordinates:[-61.4,45.8],properties:{}} as CivicAddress;
const matched: MailingCivicAddress = {...address, mailing:{status:"matched",record:{id:"synthetic-source",number:"12",suffix:"",unit:"",road:"Example RD",street:"EXAMPLE RD",city:"POSTAL VILLAGE",postalCode:"B0E1P0",additional:"RR 1",coordinates:[-61.4,45.8]}}};
afterEach(()=>vi.resetAllMocks());
describe("mailing address display",()=>{
  it("labels the mailing address, additional delivery information, source and date",async()=>{
    vi.mocked(enrichCivicAddresses).mockResolvedValue([matched]);
    render(<MailingAddressDetails addresses={[address]}/>);
    expect(await screen.findByText("Mailing: 12 EXAMPLE RD, POSTAL VILLAGE, NS B0E 1P0")).toBeInTheDocument();
    expect(screen.getByText("Additional delivery information: RR 1")).toBeInTheDocument();
    expect(screen.getByText("NAR address ID: synthetic-source")).toBeInTheDocument();
    expect(screen.getByText("Statistics Canada · June 2026")).toBeInTheDocument();
    expect(screen.getByText(/This does not constitute an endorsement/)).toBeInTheDocument();
  });
  it.each([
    ["unmatched","No confident mailing-address match"],
    ["ambiguous","Multiple address records match"],
    ["source-error","Mailing address lookup is unavailable"],
  ] as const)("keeps %s distinct",async(status,message)=>{
    vi.mocked(enrichCivicAddresses).mockResolvedValue([{...address,mailing:{status}}]);
    render(<MailingAddressDetails addresses={[address]}/>);
    expect(await screen.findByText(new RegExp(message))).toBeInTheDocument();
  });
  it("cancels and hides the previous parcel's reading during a selection change",async()=>{
    let finish!: (rows:MailingCivicAddress[])=>void;
    vi.mocked(enrichCivicAddresses).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockResolvedValueOnce([{...address,pntid:"new",mailing:{status:"unmatched"}}]);
    const view=render(<MailingAddressDetails addresses={[address]}/>);
    const signal=vi.mocked(enrichCivicAddresses).mock.calls[0][1];
    view.rerender(<MailingAddressDetails addresses={[{...address,pntid:"new"}]}/>);
    expect(signal?.aborted).toBe(true);
    await act(async()=>finish([matched]));
    expect(await screen.findByText(/No confident mailing-address match/)).toBeInTheDocument();
    expect(screen.queryByText(/Mailing: 12 EXAMPLE/)).not.toBeInTheDocument();
  });
});
