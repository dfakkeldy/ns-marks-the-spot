import { Fragment } from "react";

const URL_PATTERN = /https?:\/\/[^\s()]+/gu;

/**
 * Provenance text written for printed exports, shown on screen with its raw
 * URLs as links. A `source.json` receipt reads "Source receipt"; any other
 * address reads as its host. The href is always the URL exactly as written.
 */
export function LinkedText({ text }: { text: string }) {
  // "Receipt: <url>" would read "Receipt: Source receipt".
  const source = text.replace(/Receipt: (?=https?:\/\/)/gu, "");
  const parts: (string | { href: string; label: string })[] = [];
  let last = 0;
  for (const match of source.matchAll(URL_PATTERN)) {
    // A sentence's full stop or comma is not part of the address.
    const href = match[0].replace(/[.,;:]+$/u, "");
    const start = match.index ?? 0;
    parts.push(source.slice(last, start));
    let label = href;
    try {
      label = /\/source\.json$/u.test(new URL(href).pathname) ? "Source receipt" : new URL(href).host;
    } catch {
      // Not a parseable address: keep it as written.
    }
    parts.push({ href, label });
    last = start + href.length;
  }
  parts.push(source.slice(last));
  return (
    <>
      {parts.map((part, index) => typeof part === "string"
        ? <Fragment key={index}>{part}</Fragment>
        : <a key={index} href={part.href} target="_blank" rel="noreferrer">{part.label}</a>)}
    </>
  );
}
