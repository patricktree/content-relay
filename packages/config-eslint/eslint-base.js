// @ts-check

import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import nodePlugin from "eslint-plugin-n";
import tseslint from "typescript-eslint";

export const config = defineConfig(
  js.configs.recommended,
  nodePlugin.configs["flat/recommended-module"],
  tseslint.configs.strict,
  tseslint.configs.stylistic,
  {
    rules: {
      "@typescript-eslint/consistent-type-definitions": ["error", "type"],
    },
  },
);
