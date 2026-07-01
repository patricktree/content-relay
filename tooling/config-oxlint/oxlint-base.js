// @ts-check

import { defineConfig } from "oxlint";

export const config = defineConfig({
  categories: {
    correctness: "error",
    suspicious: "error",
  },
  plugins: ["eslint", "typescript", "node", "import"],
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
    "react-you-might-not-need-an-effect/no-derived-state": "error",
    "react-you-might-not-need-an-effect/no-chain-state-updates": "error",
    "react-you-might-not-need-an-effect/no-event-handler": "error",
    "react-you-might-not-need-an-effect/no-adjust-state-on-prop-change": "error",
    "react-you-might-not-need-an-effect/no-reset-all-state-on-prop-change": "error",
    "react-you-might-not-need-an-effect/no-pass-live-state-to-parent": "error",
    "react-you-might-not-need-an-effect/no-pass-data-to-parent": "error",
    "react-you-might-not-need-an-effect/no-external-store-subscription": "error",
    "react-you-might-not-need-an-effect/no-initialize-state": "error",
  },
});
