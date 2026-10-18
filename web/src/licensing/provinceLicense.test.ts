import { describe, expect, it } from "vitest";
import {
  OPEN_GOVERNMENT_ATTRIBUTION,
  OPEN_GOVERNMENT_LICENCE_TERMS_URL,
  OPEN_GOVERNMENT_LICENCE_URL,
  PROVINCE_ATTRIBUTION,
  PROVINCE_LICENSE_ACCEPTANCE_KEY,
  PROVINCE_LICENSE_URL,
} from "./provinceLicense";
import {
  OPEN_GOVERNMENT_ATTRIBUTION as CIVIC_OPEN_GOVERNMENT_ATTRIBUTION,
  OPEN_GOVERNMENT_LICENCE_URL as CIVIC_OPEN_GOVERNMENT_LICENCE_URL,
} from "../services/civicAddresses";

describe("Province restricted geographic services licence", () => {
  it("uses the required attribution and current licence URL", () => {
    expect(PROVINCE_ATTRIBUTION).toBe(
      "Contains information obtained under license from the Province of Nova Scotia which is provided without warranty or liability for errors or omissions.",
    );
    expect(PROVINCE_LICENSE_URL).toBe(
      "https://nsgiwa.novascotia.ca/documents/licenses/MapService/Restricted%20Map%20Services%20License%20-%20NSPRD%20v1.pdf",
    );
  });

  it("versions acceptance so future licence changes require fresh consent", () => {
    expect(PROVINCE_LICENSE_ACCEPTANCE_KEY).toBe(
      "ns-marks-the-spot:province-license:v1",
    );
  });
});

describe("Open Government Licence – Nova Scotia", () => {
  it("uses the attribution statement the licence itself mandates", () => {
    expect(OPEN_GOVERNMENT_ATTRIBUTION).toBe(
      "Contains information licensed under the Open Government Licence – Nova Scotia.",
    );
    expect(OPEN_GOVERNMENT_LICENCE_URL).toBe(
      "https://support.novascotia.ca/services/open-data-portal-licence",
    );
    expect(OPEN_GOVERNMENT_LICENCE_TERMS_URL).toBe(
      "https://novascotia.ca/opendata/licence.asp",
    );
  });

  it("keeps one definition behind the established civic-address import path", () => {
    expect(CIVIC_OPEN_GOVERNMENT_ATTRIBUTION).toBe(OPEN_GOVERNMENT_ATTRIBUTION);
    expect(CIVIC_OPEN_GOVERNMENT_LICENCE_URL).toBe(OPEN_GOVERNMENT_LICENCE_URL);
  });

  it("stays distinct from the restricted map services licence", () => {
    expect(OPEN_GOVERNMENT_ATTRIBUTION).not.toBe(PROVINCE_ATTRIBUTION);
    expect(OPEN_GOVERNMENT_LICENCE_URL).not.toBe(PROVINCE_LICENSE_URL);
  });
});
