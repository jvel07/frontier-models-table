import React, { useState, useEffect, useCallback } from "react";
import { createRoot } from "react-dom/client";
import Backdrop from "./Backdrop.jsx";
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

/**
 * Names that have appeared in a shared URL and no longer exist.
 *
 * The Anthropic rows dropped their "Claude " prefix, which would have 404'd every
 * #/model/Claude%20Opus%205 and every comparison containing one — links this site
 * chose hash routing specifically to keep working. Resolving the old name costs a
 * lookup and keeps a citation from rotting, which is the whole argument for giving
 * a row a URL in the first place.
 */
const RENAMED = {
  "Claude Opus 5": "Opus 5",
  "Claude Sonnet 5": "Sonnet 5",
  "Claude Fable 5": "Fable 5",
  "Claude Opus 4.8": "Opus 4.8",
  "Claude Sonnet 4.6": "Sonnet 4.6",
  "Claude Haiku 4.5": "Haiku 4.5",
};
const resolve = (name) => RENAMED[name] || name;

export function parseHash(hash = window.location.hash) {
  if (/^#\/attention\/?$/.test(hash || "")) return { page: "attention", models: [] };
  if (/^#\/papers\/?$/.test(hash || "")) return { page: "papers", models: [] };
  if (/^#\/trends\/?$/.test(hash || "")) return { page: "trends", models: [] };
  if (/^#\/openness\/?$/.test(hash || "")) return { page: "openness", models: [] };
  if (/^#\/tools\/?$/.test(hash || "")) return { page: "tools", models: [] };
  // A single model, so a row can be linked to and cited: #/model/Kimi%20K3
  const one = /^#\/model\/(.+)$/.exec(hash || "");
  if (one) return { page: "table", models: [], focus: resolve(decodeURIComponent(one[1])) };
  const m = /^#\/compare\/?(.*)$/.exec(hash || "");
  if (!m) return { page: "table", models: [] };
  const raw = m[1] || "";
  const models = raw
    .split(SEP)
    .map((s) => resolve(decodeURIComponent(s.trim())))
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

  // The backdrop sits outside the route switch so it survives navigation: rebuilding
  // it per page would restart the parallax from zero on every hash change.
  const page =
    route.page === "compare" ? <CompareView names={route.models} onBack={goBack} />
      : route.page === "attention" ? <AttentionView />
      : route.page === "papers" ? <PapersView />
      : route.page === "trends" ? <TrendsView />
      : route.page === "openness" ? <OpennessView />
      : route.page === "tools" ? <ToolsView />
      : <FrontierModelsTable focus={route.focus} />;
  return <><Backdrop />{page}</>;
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
