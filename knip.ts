import type { KnipConfig } from "knip";

const config: KnipConfig = {
  $schema: "./node_modules/knip/schema.json",
  ignore: [
    /* ignore the patricktree-stack packages themselves, since they are not part of this monorepo */
    ".patricktree-stack/**",
  ],
  workspaces: {
    ".": {
      /* Zizmor is an external validation tool installed through uvx, not a Node dependency */
      ignoreBinaries: ["gh", "uvx"],
      ignoreDependencies: [
        "husky",
        "@emnapi/core",
        "@emnapi/runtime",
        /* oxlint doesn't resolve dependencies correctly, we need it in the root node_modules */
        "eslint-plugin-react-you-might-not-need-an-effect",
      ],
    },
    "apps/macos-app": {
      ignoreDependencies: ["@content-relay/web-app"],
    },
    "apps/mobile-app": {
      ignoreFiles: ["./android/**", "./ios/**"],
    },
    "apps/web-app": {
      /* ambient module augmentations, never imported */
      entry: ["src/types.ts"],
    },
    "qa-utils/seeding-tool": {
      ignoreFiles: ["./src/playground.ts"],
    },
  },
};

export default config;
