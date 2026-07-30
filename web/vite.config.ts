import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    manifest: true,
  },
  test: {
    environment: "jsdom",
    exclude: [
      ...configDefaults.exclude,
      "scripts/checkPdfAssets.test.mjs",
      "scripts/probeGeoPdfFrames.test.mjs",
    ],
    setupFiles: "./src/test/setup.ts",
  },
});
