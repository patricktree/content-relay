// @ts-check

import { defineConfig } from "oxlint";

export const config = defineConfig({
  categories: {
    correctness: "error",
    suspicious: "error",
  },
  plugins: ["eslint", "typescript", "node", "import"],
  rules: {
    "no-restricted-globals": [
      "error",
      {
        name: "Date",
        message: "Use `Temporal` via polyfill `temporal-polyfill` instead.",
      },
    ],
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["./**", "../**"],
            message: "Use `#pkg/*` subpath imports instead of relative imports.",
          },
        ],
      },
    ],
    "no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
      },
    ],
    "import/no-unassigned-import": "off",
    "typescript/consistent-type-definitions": ["error", "type"],
  },
});
