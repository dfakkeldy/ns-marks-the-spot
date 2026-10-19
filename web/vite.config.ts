import { pokerOfflinePlugin } from "./scripts/pokerOfflinePlugin";
import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { loadEnv, type PreviewServer, type ViteDevServer } from "vite";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import provincialReceipt from "./public/atlas/provincial/source.json";

/**
 * Local servers answer each focus page's HTML at its map-relative path
 * (rhodena.html at /rhodena, fishing.html at /fishing, pointtupper.html at
 * /pointtupper), the path it has under
 * the published map (/apps/nsmarksthespot/map/fishing). The public short URLs
 * are KinNoKi site rewrites onto those paths. Rhodena's short URL is the same
 * /rhodena path; the fishing page's is /fishmap, which is not routed here,
 * because the site's own /fishing/ is a separate static guide. Only the bare path and its trailing-slash form are
 * routed, so the page's data files under the same name
 * (/fishing/spots.geojson) are served as files.
 */
const FOCUS_PAGES = ["rhodena", "fishing", "pointtupper"] as const;

function focusRoute(request: IncomingMessage, response: ServerResponse, next: () => void) {
  const url = request.url ?? "";
  for (const page of FOCUS_PAGES) {
    if (url === `/${page}/` || url.startsWith(`/${page}/?`)) {
      response.writeHead(302, { Location: url.replace(`/${page}/`, `/${page}`) });
      response.end();
      return;
    }
    if (url === `/${page}` || url.startsWith(`/${page}?`)) {
      request.url = url.replace(`/${page}`, `/${page}.html`);
      break;
    }
  }
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
  // A same-origin synthetic tile endpoint exercises the real CHM controls in CI.
  // Normal development and production builds still require an explicit host.
  define: mode === "browser-test" ? {
    "import.meta.env.VITE_CHM_TILE_BASE_URL": JSON.stringify("http://127.0.0.1:4173/e2e/chm-tiles"),
  } : undefined,
  plugins: [react(), pokerOfflinePlugin(), {
    name: "focus-page-routes",
    configureServer(server: ViteDevServer) { server.middlewares.use(focusRoute); },
    configurePreviewServer(server: PreviewServer) { server.middlewares.use(focusRoute); },
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
        app: "index.html", poker: "poker.html", rhodena: "rhodena.html", fishing: "fishing.html", pointtupper: "pointtupper.html", atlas: "atlas.html", terrain: "terrain.html",
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
      "scripts/buildFishingStockedWaters.test.mjs",
      "scripts/checkFishing.test.mjs",
    ],
    setupFiles: "./src/test/setup.ts",
  },
}));
