import { describe, expect, it } from "vitest";
import {
  PROVINCE_ATTRIBUTION,
  PROVINCE_LICENSE_ACCEPTANCE_KEY,
  PROVINCE_LICENSE_URL,
} from "./provinceLicense";

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
