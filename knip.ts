import type { KnipConfig } from "knip";

const config: KnipConfig = {
  $schema: "./node_modules/knip/schema.json",
  ignore: [
    /* ignore the patricktree-stack packages themselves, since they are not part of this monorepo */
    ".patricktree-stack/**",
  ],
  workspaces: {
    ".": {
      ignoreDependencies: ["husky", "@emnapi/core", "@emnapi/runtime"],
    },
    "apps/macos-app": {
      ignoreDependencies: ["@content-relay/web-app"],
    },
    "apps/mobile-app": {
      ignoreDependencies: ["@patricktree-stack/config-typescript"],
      ignoreFiles: ["./android/**", "./ios/**"],
    },
    "apps/web-app": {
      ignoreFiles: ["./wyw-in-js.config.cjs"],
    },
    "qa-utils/seeding-tool": {
      ignoreFiles: ["./src/playground.ts"],
    },
  },
};

export default config;
