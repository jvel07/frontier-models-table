import React, { useState, useEffect, useCallback } from "react";
import { createRoot } from "react-dom/client";
import FrontierModelsTable from "./FrontierModelsTable.jsx";
import CompareView from "./CompareView.jsx";
import AttentionView from "./AttentionView.jsx";
import PapersView from "./PapersView.jsx";

/**
 * Hash-based routing on purpose.
 *
 * GitHub Pages serves static files with no SPA rewrite, so a real path like
 * /compare would 404 on reload or when someone pastes the link. A hash route
 * survives both, still gives each comparison its own shareable URL, and keeps
 * the back button working — which is what "opens in the same tab" needs.
 *
 *   #/compare/Kimi%20K3|Qwen3%20235B-A22B
 */
const SEP = "|";

export function parseHash(hash = window.location.hash) {
  if (/^#\/attention\/?$/.test(hash || "")) return { page: "attention", models: [] };
  if (/^#\/papers\/?$/.test(hash || "")) return { page: "papers", models: [] };
  const m = /^#\/compare\/?(.*)$/.exec(hash || "");
  if (!m) return { page: "table", models: [] };
  const raw = m[1] || "";
  const models = raw
    .split(SEP)
    .map((s) => decodeURIComponent(s.trim()))
    .filter(Boolean);
  return { page: "compare", models };
}

export const compareHref = (names) =>
  `#/compare/${names.map(encodeURIComponent).join(SEP)}`;

function Root() {
  const [route, setRoute] = useState(() => parseHash());

  useEffect(() => {
    const onHash = () => {
      setRoute(parseHash());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const goBack = useCallback(() => {
    // Prefer real history so the browser back button and this button agree.
    if (window.history.length > 1) window.history.back();
    else window.location.hash = "";
  }, []);

  if (route.page === "compare") return <CompareView names={route.models} onBack={goBack} />;
  if (route.page === "attention") return <AttentionView />;
  if (route.page === "papers") return <PapersView />;
  return <FrontierModelsTable />;
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
