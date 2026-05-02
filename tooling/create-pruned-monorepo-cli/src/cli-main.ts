import * as commander from "@commander-js/extra-typings";

import { isContentRelayProjectName } from "@content-relay/pkg-management";

import { createPrunedMonorepo } from "#pkg/create-pruned-monorepo.ts";

const program = new commander.Command()
  .addOption(
    new commander.Option("--project-name <project-name>")
      .makeOptionMandatory()
      .argParser((value) => {
        if (!isContentRelayProjectName(value)) {
          throw new commander.InvalidArgumentError(
            `Must be a valid content-relay project name, but is not.`,
          );
        }
        return value;
      }),
  )
  .addOption(new commander.Option("--target-dir <path>").makeOptionMandatory());
program.parse();
const opts = program.opts();

await createPrunedMonorepo(opts);
