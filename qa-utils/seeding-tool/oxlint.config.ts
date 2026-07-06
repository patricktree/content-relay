import { defineConfig } from "oxlint";

import { config as baseConfig } from "@content-relay/config-oxlint/oxlint-base.js";

export default defineConfig({ extends: [baseConfig] });
