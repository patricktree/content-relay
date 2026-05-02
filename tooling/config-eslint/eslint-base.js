// @ts-check

import js from "@eslint/js";
import nodePlugin from "eslint-plugin-n";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export const config = defineConfig(
  globalIgnores(["**/dist"]),
  js.configs.recommended,
  nodePlugin.configs["flat/recommended-module"],
  {
    rules: {
      /* covered by TypeScript anyways */
      "n/no-missing-import": "off",
    },
  },
  {
    files: ["**/*"],
    ignores: ["test/**", "**/*.spec.ts"],
    rules: {
      "n/no-restricted-import": [
        "error",
        [
          {
            name: "./**",
            message: "Use `#pkg/*` subpath imports instead of relative imports.",
          },
          {
            name: "../**",
            message: "Use `#pkg/*` subpath imports instead of relative imports.",
          },
        ],
      ],
    },
  },
  tseslint.configs.strict,
  tseslint.configs.stylistic,
  {
    rules: {
      "@typescript-eslint/consistent-type-definitions": ["error", "type"],
    },
  },
  {
    rules: {
      "no-restricted-globals": [
        "error",
        {
          name: "Date",
          message: "Use `Temporal` via polyfill `temporal-polyfill` instead.",
        },
      ],
    },
  },
);
