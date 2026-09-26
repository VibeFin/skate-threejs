import { defineConfig } from "vite";

export default defineConfig({
  // Published games are served from a subpath — relative asset URLs keep the
  // build working there and in local dev alike.
  base: "./",
});
