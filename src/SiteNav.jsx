import React, { useState, useCallback } from "react";

// Deliberately imports nothing from the pages it sits on. FrontierModelsTable renders
// this, so pulling `S` back out of it would be a module cycle — and the style object
// is built at module scope, which is exactly where a cycle bites.
const mono = "ui-monospace, 'SF Mono', 'Cascadia Code', Menlo, monospace";

/**
 * The site's one navigation bar, on every page.
 *
 * It owns the theme toggle rather than the table doing so, because the toggle used
 * to exist only on the table — open a comparison or the attention menu and it
 * vanished. State is read from the <html data-theme> attribute that index.html sets
 * before first paint, so this stays correct no matter which page loaded first.
 *
 * Laid out as its own full-width row instead of sharing a line with the eyebrow.
 * On a phone the old arrangement wrapped into overlapping blocks.
 */

export const PAGES = [
  { key: "table", href: "#/", label: "Atlas" },
  { key: "attention", href: "#/attention", label: "Attention" },
  { key: "papers", href: "#/papers", label: "Papers" },
];

export default function SiteNav({ current }) {
  const [dark, setDark] = useState(
    () => typeof document !== "undefined" &&
      document.documentElement.getAttribute("data-theme") === "dark"
  );

  const toggleTheme = useCallback(() => {
    setDark((d) => {
      const next = !d;
      const root = document.documentElement;
      if (next) root.setAttribute("data-theme", "dark");
      else root.removeAttribute("data-theme");
      try { localStorage.setItem("fmt-theme", next ? "dark" : "light"); } catch (e) {}
      return next;
    });
  }, []);

  return (
    <nav style={N.bar} aria-label="Site sections">
      <div style={N.group}>
        {PAGES.map((p) => {
          const on = p.key === current;
          return (
            <a key={p.key} href={p.href} aria-current={on ? "page" : undefined}
              style={{ ...N.item, ...(on ? N.itemOn : null) }}>
              {p.label}
            </a>
          );
        })}
      </div>
      <button type="button" onClick={toggleTheme} style={N.theme} aria-pressed={dark}
        aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
        title={dark ? "Switch to light theme" : "Switch to dark theme"}>
        <span aria-hidden="true">{dark ? "☀" : "☾"}</span>
        {dark ? "Light" : "Dark"}
      </button>
    </nav>
  );
}

const N = {
  bar: { display: "flex", alignItems: "center", justifyContent: "space-between",
    gap: 12, flexWrap: "wrap", marginBottom: 26, paddingBottom: 14,
    borderBottom: "1px solid var(--line)" },
  group: { display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" },
  item: { display: "inline-block", padding: "7px 14px", borderRadius: 6,
    fontFamily: mono, fontSize: 12.5, letterSpacing: "0.06em", textTransform: "uppercase",
    color: "var(--ink-soft)", textDecoration: "none", whiteSpace: "nowrap",
    border: "1px solid transparent" },
  itemOn: { background: "var(--clay)", color: "var(--on-clay)", borderColor: "var(--clay)" },
  theme: { display: "inline-flex", alignItems: "center", gap: 7, background: "transparent",
    border: "1px solid var(--line)", borderRadius: 6, padding: "6px 12px",
    fontFamily: mono, fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase",
    color: "var(--ink-soft)", cursor: "pointer", whiteSpace: "nowrap" },
};
