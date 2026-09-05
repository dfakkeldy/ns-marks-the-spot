import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import provincialReceipt from "./public/atlas/provincial/source.json";

export default defineConfig(({ mode }) => ({
  plugins: [react(), {
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
      input: { app: "index.html", atlas: "atlas.html" },
    },
  },
  test: {
    environment: "jsdom",
    exclude: [
      ...configDefaults.exclude,
      "e2e/**",
      "scripts/checkPdfAssets.test.mjs",
      "scripts/checkProvincialAtlas.test.mjs",
      "scripts/exportSharedData.test.mjs",
      "scripts/probeGeoPdfFrames.test.mjs",
    ],
    setupFiles: "./src/test/setup.ts",
  },
}));
