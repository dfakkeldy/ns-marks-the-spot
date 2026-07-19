export type TaxSaleEventStatus = "upcoming" | "historical";
export type TaxSaleEventType = "public-auction" | "sealed-tender";
export type TaxSaleListingStatus =
  | "advertised"
  | "withdrawn"
  | "sold"
  | "unsold";
export type RedemptionCategory =
  | "six-month"
  | "immediate-deed"
  | "not-redeemable"
  | "unknown";

export type MunicipalFinancialField = {
  kind:
    | "minimum-bid"
    | "total-arrears"
    | "recovery-amount"
    | "successful-bid";
  label: string;
  amountCents: number;
};

export type TaxSaleListing = {
  eventId: string;
  recordId: string;
  lien?: string;
  aan?: string;
  pids: string[];
  addressOrDescription?: string;
  location: string;
  financial: MunicipalFinancialField;
  redemptionCategory: RedemptionCategory;
  redemptionLabel: string;
  listingStatus: TaxSaleListingStatus;
};

export type TaxSaleEvent = {
  id: string;
  municipalityId: string;
  municipality: string;
  shortMunicipality: string;
  eventType: TaxSaleEventType;
  eventStatus: TaxSaleEventStatus;
  saleStartsAt?: string;
  closedAt?: string;
  venue?: string;
  sourceUrl: string;
  secondarySourceUrl?: string;
  landingPageUrl?: string;
  sourceLabel: string;
  publishedOn?: string;
  retrievedOn: string;
  sourceDatasetSha256?: string;
  listings: TaxSaleListing[];
};
