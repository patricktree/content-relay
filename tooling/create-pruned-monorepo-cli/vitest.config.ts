import { defineConfig, mergeConfig } from "vitest/config";

import { config as baseConfig } from "@content-relay/config-vitest/vitest-base.js";

export default mergeConfig(baseConfig, defineConfig({}));
