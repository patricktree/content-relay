import { createBaseConfig } from "@patricktree-stack/config-oxfmt/oxfmt-base.js";
import { defineConfig } from "oxfmt";

const baseConfig = createBaseConfig({
  patricktreeStackGitSubmoduleRelativePath: ".patricktree-stack",
});

export default defineConfig({
  ...baseConfig,
  ignorePatterns: [
    ...baseConfig.ignorePatterns,
    /* macos-app tauri generated files */
    "/apps/macos-app/src/gen/**",
  ],
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
});
