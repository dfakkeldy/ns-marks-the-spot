import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
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
      "scripts/checkPdfAssets.test.mjs",
      "scripts/exportSharedData.test.mjs",
      "scripts/probeGeoPdfFrames.test.mjs",
    ],
    setupFiles: "./src/test/setup.ts",
  },
});
