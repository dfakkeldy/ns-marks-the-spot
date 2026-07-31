/**
 * The app's one "save this to the user's computer" primitive: create an
 * object URL, click a synthetic anchor, revoke. Extracted from the two
 * places that grew the same sequence independently (the Allmaps
 * georeference export and the evidence-note export).
 *
 * The revoke sits in a `finally` because a leaked object URL pins its Blob
 * in memory for the life of the tab — and `click()` can throw when a browser
 * blocks a programmatic download.
 */
export function downloadFile(filename: string, blob: Blob): void {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    link.click();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
