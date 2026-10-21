import { defineConfig } from "oxlint";

import { config as repoConfig } from "@content-relay/config-oxlint/oxlint-base.js";

export default defineConfig({ extends: [repoConfig] });
