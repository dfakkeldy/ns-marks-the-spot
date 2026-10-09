import { pokerOfflinePlugin } from "./scripts/pokerOfflinePlugin";
import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { loadEnv, type PreviewServer, type ViteDevServer } from "vite";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import provincialReceipt from "./public/atlas/provincial/source.json";

/** The site serves rhodena.html at /rhodena; local servers answer the same path. */
function rhodenaRoute(request: IncomingMessage, response: ServerResponse, next: () => void) {
  const url = request.url ?? "";
  if (/^\/rhodena\/(?:\?|$)/u.test(url)) {
    response.writeHead(302, { Location: url.replace(/^\/rhodena\//u, "/rhodena") });
    response.end();
    return;
  }
  if (/^\/rhodena(?:\?|$)/u.test(url)) request.url = url.replace(/^\/rhodena/u, "/rhodena.html");
  next();
}

function localArchiveHeaders(request: IncomingMessage, response: ServerResponse, next: () => void) {
  if ((request.url ?? "").split("?")[0]?.endsWith(".pmtiles")) {
    // Local ranged responses can fail in Chromium's HTTP cache despite valid bytes.
    // Keep local range reads reliable; production hosting and PMTiles' own cache
    // retain their existing policies.
    response.setHeader("Cache-Control", "no-store");
  }
  next();
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), pokerOfflinePlugin(), {
    name: "rhodena-route",
    configureServer(server: ViteDevServer) { server.middlewares.use(rhodenaRoute); },
    configurePreviewServer(server: PreviewServer) { server.middlewares.use(rhodenaRoute); },
  }, {
    name: "local-pmtiles-range-cache",
    configureServer(server: ViteDevServer) { server.middlewares.use(localArchiveHeaders); },
    configurePreviewServer(server: PreviewServer) { server.middlewares.use(localArchiveHeaders); },
  }, {
    name: "omit-r2-provincial-archive",
    apply: "build",
    async closeBundle() {
      const host = process.env.VITE_PROVINCIAL_ATLAS_BASE_URL ?? loadEnv(mode, process.cwd()).VITE_PROVINCIAL_ATLAS_BASE_URL;
      if (host) {
        // The checksum gate checks the local archive, but Pages must not receive
        // a 270 MB duplicate of the immutable object served by R2.
        await rm(resolve("dist/atlas/provincial", provincialReceipt.archive), { force: true });
      }
    },
  }],
  base: "./",
  server: {
    // Honor a harness/CI-assigned port so parallel worktree sessions don't
    // fight over Vite's default 5173; unset PORT keeps the default.
    port: Number(process.env.PORT) || 5173,
  },
  optimizeDeps: {
    // The dependency scan does not follow `?worker&url` imports, so the PDF.js
    // worker would otherwise be discovered mid-import, reloading the page.
    include: ["pdfjs-dist/build/pdf.worker.mjs"],
  },
  build: {
    manifest: true,
    rollupOptions: {
      input: {
        app: "index.html", poker: "poker.html", rhodena: "rhodena.html", atlas: "atlas.html", terrain: "terrain.html",
        // Exercise browser fixtures in preview without shipping them in production.
        ...(mode === "browser-test" ? { print: "e2e/print.html", electoral: "e2e/electoral.html", tileCache: "e2e/tile-cache.html" } : {}),
      },
    },
  },
  test: {
    environment: "jsdom",
    exclude: [
      ...configDefaults.exclude,
      "e2e/**",
      "scripts/checkPdfAssets.test.mjs",
      "scripts/checkMailingAddresses.test.mjs",
      "scripts/checkProvincialAtlas.test.mjs",
      "scripts/checkCrownAtlas.test.mjs",
      "scripts/exportSharedData.test.mjs",
      "scripts/probeGeoPdfFrames.test.mjs",
    ],
    setupFiles: "./src/test/setup.ts",
  },
}));
