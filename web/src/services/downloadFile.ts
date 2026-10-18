/**
 * The app's one "save this to the user's computer" primitive: create an
 * object URL, click a real in-DOM anchor, revoke LATER. Extracted from the
 * two places that grew the same sequence independently (the Allmaps
 * georeference export and the evidence-note export).
 *
 * Two Safari-isms shape it. The anchor is appended to the document because
 * detached-anchor downloads have a history of being ignored there, and the
 * revoke is DEFERRED because Safari starts fetching the blob URL after the
 * click task — a synchronous revoke intermittently aborted the download,
 * yielding a zero-byte or missing file with no error anywhere. Ten seconds
 * is orders of magnitude beyond the fetch-start window while still bounding
 * how long the Blob stays pinned; a click() that throws (a browser blocking
 * the programmatic download) still revokes immediately, since no fetch was
 * started.
 */
export const DOWNLOAD_REVOKE_DELAY_MS = 10_000;

export function downloadFile(filename: string, blob: Blob): void {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.append(link);
  try {
    link.click();
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  } finally {
    link.remove();
  }
  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, DOWNLOAD_REVOKE_DELAY_MS);
}
