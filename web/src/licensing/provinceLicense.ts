export const PROVINCE_ATTRIBUTION =
  "Contains information obtained under license from the Province of Nova Scotia which is provided without warranty or liability for errors or omissions.";

export const PROVINCE_LICENSE_URL =
  "https://nsgiwa.novascotia.ca/documents/licenses/MapService/Restricted%20Map%20Services%20License%20-%20NSPRD%20v1.pdf";

export const PROVINCE_LICENSE_ACCEPTANCE_KEY =
  "ns-marks-the-spot:province-license:v1";

// Open Government Licence – Nova Scotia. Distinct from the restricted map
// services licence above: it needs no acceptance gate, but the licence text
// mandates this exact attribution statement when the Information Provider
// specifies none. Re-exported from services/civicAddresses for existing callers.
export const OPEN_GOVERNMENT_ATTRIBUTION =
  "Contains information licensed under the Open Government Licence – Nova Scotia.";

export const OPEN_GOVERNMENT_LICENCE_URL =
  "https://support.novascotia.ca/services/open-data-portal-licence";

/** The licence text itself, which provincial dataset pages link as their terms. */
export const OPEN_GOVERNMENT_LICENCE_TERMS_URL =
  "https://novascotia.ca/opendata/licence.asp";
