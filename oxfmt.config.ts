import { defineConfig } from "oxfmt";

export default defineConfig({
  ignorePatterns: [
    /* ignore the patricktree-stack packages themselves, since they are not part of this monorepo */
    "/.patricktree-stack/**",
    /* pnpm-workspace.yaml is managed by pnpm */
    "/pnpm-workspace.yaml",
    /* macos-app tauri generated files */
    "/apps/macos-app/src/gen/**",
  ],
  sortPackageJson: {
    sortScripts: true,
  },
  sortImports: {
    customGroups: [
      /* create a group for content-relay packages to separate them from other external dependencies */
      {
        groupName: "content-relay-packages",
        elementNamePattern: ["@content-relay/**"],
      },
      /* create a group for subpath imports = internal dependencies */
      {
        groupName: "subpath-imports",
        elementNamePattern: ["#src/**"],
      },
      /* create a group for subpath imports for test modules */
      {
        groupName: "subpath-imports-test-modules",
        elementNamePattern: ["#test/**"],
      },
      /* create a group for subpath imports for E2E test modules */
      {
        groupName: "subpath-imports-test-modules-e2e",
        elementNamePattern: ["#test-e2e/**"],
      },
    ],
    groups: [
      ["value-builtin", "value-external"],
      "value-external",
      "value-internal",
      "content-relay-packages",
      "subpath-imports",
      "subpath-imports-test-modules",
      "subpath-imports-test-modules-e2e",
      ["value-parent", "value-sibling", "value-index"],
      "unknown",
    ],
  },
  jsdoc: true,
});
