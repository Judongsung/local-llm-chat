import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const HTML_ENTRIES = {
  app: fileURLToPath(new URL("./index.html", import.meta.url)),
  galleryViewer: fileURLToPath(
    new URL("./gallery-viewer.html", import.meta.url),
  ),
};

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: HTML_ENTRIES,
    },
  },
});
