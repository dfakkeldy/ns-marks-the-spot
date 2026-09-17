import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "leaflet/dist/leaflet.css";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./styles.css";

// Existing bookmarks and cached /poker 301s lead here. A fresh query avoids
// replaying that old cached redirect; the dedicated page keeps the short URL.
const legacyPoker = window.location.pathname === "/apps/nsmarksthespot/map/"
  && new URLSearchParams(window.location.search).get("theme") === "poker";
if (legacyPoker) window.location.replace("/poker?app=1");
else createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
