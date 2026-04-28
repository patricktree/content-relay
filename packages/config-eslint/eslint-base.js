// @ts-check

import js from "@eslint/js";
import nodePlugin from "eslint-plugin-n";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export const config = defineConfig(
  js.configs.recommended,
  nodePlugin.configs["flat/recommended-module"],
  tseslint.configs.strict,
  tseslint.configs.stylistic,
  {
    rules: {
      "no-restricted-globals": [
        "error",
        {
          name: "Date",
          message: "Use `Temporal` via polyfill `temporal-polyfill` instead.",
        },
      ],
      "@typescript-eslint/consistent-type-definitions": ["error", "type"],
    },
  },
);
