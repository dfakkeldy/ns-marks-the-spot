import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { loadEnv, type PreviewServer, type ViteDevServer } from "vite";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import provincialReceipt from "./public/atlas/provincial/source.json";

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
  plugins: [react(), {
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
  build: {
    manifest: true,
    rollupOptions: {
      input: {
        app: "index.html", atlas: "atlas.html",
        // Exercise print components in preview without shipping the synthetic fixture.
        ...(mode === "browser-test" ? { print: "e2e/print.html" } : {}),
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
      "scripts/exportSharedData.test.mjs",
      "scripts/probeGeoPdfFrames.test.mjs",
    ],
    setupFiles: "./src/test/setup.ts",
  },
}));
