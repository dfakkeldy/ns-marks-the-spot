// App-level tests mount the real useUserMaps hook, which opens IndexedDB;
// jsdom has none, so the whole suite gets an in-memory implementation.
import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
  localStorage.clear();
});
