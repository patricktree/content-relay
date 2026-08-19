import react from "@vitejs/plugin-react";
import wyw from "@wyw-in-js/vite";
import url from "node:url";
import { defineConfig } from "vite";

const WYW_CONFIG_FILE = url.fileURLToPath(
  import.meta.resolve("@patricktree-stack/config-wyw-in-js/wyw-in-js.config.cjs"),
);

export default defineConfig({
  build: {
    outDir: "dist/web",
  },
  plugins: [wyw({ configFile: WYW_CONFIG_FILE, keepComments: true }), react()],
});
