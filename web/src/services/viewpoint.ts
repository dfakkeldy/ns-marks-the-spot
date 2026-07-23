const VIEWPOINT_PROPERTY_BASE_URL =
  "https://www.viewpoint.ca/show/property";

export function viewpointParcelUrl(pid: string): string {
  if (!/^\d{8}$/u.test(pid)) {
    throw new Error("ViewPoint parcel links require a PID with exactly eight digits.");
  }

  return `${VIEWPOINT_PROPERTY_BASE_URL}/${pid}`;
}
