import React, { useState, useEffect, useCallback } from "react";
import { createRoot } from "react-dom/client";
import FrontierModelsTable from "./FrontierModelsTable.jsx";
import CompareView from "./CompareView.jsx";
import AttentionView from "./AttentionView.jsx";
import PapersView from "./PapersView.jsx";
import TrendsView from "./TrendsView.jsx";
import OpennessView from "./OpennessView.jsx";
import ToolsView from "./ToolsView.jsx";

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
  if (/^#\/trends\/?$/.test(hash || "")) return { page: "trends", models: [] };
  if (/^#\/openness\/?$/.test(hash || "")) return { page: "openness", models: [] };
  if (/^#\/tools\/?$/.test(hash || "")) return { page: "tools", models: [] };
  // A single model, so a row can be linked to and cited: #/model/Kimi%20K3
  const one = /^#\/model\/(.+)$/.exec(hash || "");
  if (one) return { page: "table", models: [], focus: decodeURIComponent(one[1]) };
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
  if (route.page === "trends") return <TrendsView />;
  if (route.page === "openness") return <OpennessView />;
  if (route.page === "tools") return <ToolsView />;
  return <FrontierModelsTable focus={route.focus} />;
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
