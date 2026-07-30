import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `base` must match the path the site is served from. GitHub Pages serves a project
// site at https://<user>.github.io/<repo>/, so it needs the repo path — without it the
// built asset URLs point at the domain root and the page renders blank.
// Hosts that serve from the domain root (Cloudflare Pages, Netlify, Surge) need "/",
// which you can set without editing this file:  BASE=/ npm run build
export default defineConfig({
  plugins: [react()],
  base: process.env.BASE ?? "/frontier-models-table/",
});
