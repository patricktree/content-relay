import { defineConfig, globalIgnores } from "eslint/config";

import { config } from "@content-relay/config-eslint/eslint-base.js";

export default defineConfig(globalIgnores(["android/**", "ios/**", "vite-outdir/**"]), config);
