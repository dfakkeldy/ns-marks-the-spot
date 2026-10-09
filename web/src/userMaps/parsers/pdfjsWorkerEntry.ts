// PDF.js worker entry. Module imports run in order, so the polyfill is in
// place before the vendored worker evaluates and starts answering messages.
import "./mapUpsertPolyfill";
import "pdfjs-dist/build/pdf.worker.min.mjs";
