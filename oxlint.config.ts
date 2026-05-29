/**
 * The oxlint VS Code extension allows to specify `maxWarnings` and `typeAware` options only in the
 * "root configuration file", which is `oxlint.config.ts` in the folder opened in VS Code (i.e. the
 * root of the monorepo). That's why we have this file here - for the VS Code extension to work.
 *
 * When linting workspace projects via CLI (`oxlint ...`), we pass it as CLI options (`oxlint
 * --type-aware --max-warnings 0 ...`). Setting it in the respective `oxlint.config.ts` is NOT
 * possible because the oxlint VS Code extension then breaks down again...
 */

import { defineConfig } from "oxlint";

export default defineConfig({
  options: {
    maxWarnings: 0,
    typeAware: true,
  },
});
