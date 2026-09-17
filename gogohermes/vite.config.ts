import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  /* This IS the GOGO landing page now, served at /gogo/.
     The app itself moved to /gogo/app.html, and the inner pages
     (rides, why, driver, messages, rider) stay where they are. */
  base: "/gogo/",
  build: {
    /* The build goes into a _build folder beside the source, NOT into /gogo.
       /gogo holds only what is live; the built copy lives with the source so
       the two can never be confused for one another. Deploying is a copy from
       here into the repo:

           cp -r _build/{index.html,_app,fonts} ../

       A fixed (non-hashed) folder name keeps the deploy command stable, while
       the filenames inside stay content-hashed so Cloudflare cannot serve a
       stale bundle. */
    outDir: path.resolve(__dirname, "_build"),
    emptyOutDir: true,
    assetsDir: "_app",
    /* Content-hashed filenames. Cloudflare cached an older bundle under a
       fixed name and kept serving HTML in its place, blanking the page. A hash
       means every deploy gets a URL nothing can have cached. */
    rollupOptions: {
      output: {
        entryFileNames: "_app/app-[hash].js",
        chunkFileNames: "_app/chunk-[hash].js",
        assetFileNames: "_app/asset-[hash][extname]",
      },
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
