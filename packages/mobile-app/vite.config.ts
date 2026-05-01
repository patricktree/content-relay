import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "vite-outdir",
  },
  plugins: [react()],
});
