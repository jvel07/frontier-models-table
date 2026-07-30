import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base must match the GitHub Pages repo path (https://<user>.github.io/<repo>/),
// otherwise the built asset URLs resolve to the domain root and the page loads blank.
export default defineConfig({
  plugins: [react()],
  base: "/frontier-models-table/",
});
