// @ts-check

import { defineConfig } from "oxlint";

export const config = defineConfig({
  categories: {
    correctness: "error",
    suspicious: "error",
  },
  plugins: [
    "eslint",
    "typescript",
    "node",
    "import",
    "unicorn",
    "react",
    "react-perf",
    "jsdoc",
    "jsx-a11y",
    "promise",
    "vitest",
  ],
  jsPlugins: ["eslint-plugin-react-you-might-not-need-an-effect"],
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
            message: "Use `#src/*` subpath imports instead of relative imports.",
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
    "react-you-might-not-need-an-effect/no-derived-state": "error",
    "react-you-might-not-need-an-effect/no-chain-state-updates": "error",
    "react-you-might-not-need-an-effect/no-event-handler": "error",
    "react-you-might-not-need-an-effect/no-adjust-state-on-prop-change": "error",
    "react-you-might-not-need-an-effect/no-reset-all-state-on-prop-change": "error",
    "react-you-might-not-need-an-effect/no-pass-live-state-to-parent": "error",
    "react-you-might-not-need-an-effect/no-pass-data-to-parent": "error",
    "react-you-might-not-need-an-effect/no-external-store-subscription": "error",
    "react-you-might-not-need-an-effect/no-initialize-state": "error",
    // oxlint seems to not support `languageOptions` which would allow us to configure the `ecmaVersion` to some older version and unicorn would then not complain about `Array.prototype.sort` being used. For now, we just disable the rule.
    "unicorn/no-array-sort": "off",
  },
});
