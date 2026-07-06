// @ts-check

import { defineConfig } from "vitest/config";

export const config = defineConfig({
  test: {
    /**
     * By default we should write tests which don't rely on side effects and properly cleanup state;
     * test isolation is not needed then, disabling it improves performance.
     *
     * See also {@link https://vitest.dev/guide/improving-performance.html#test-isolation}.
     */
    isolate: false,

    reporters: process.env.GITHUB_ACTIONS
      ? [
          "default",
          [
            "github-actions",
            {
              jobSummary: {
                // disable - in case we switch to vitest projects for better monorepo support, we can think about enabling it again
                enabled: false,
              },
            },
          ],
        ]
      : ["default"],
  },
});
