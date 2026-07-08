import * as commander from "@commander-js/extra-typings";
import { createPrunedMonorepo } from "@patricktree-stack/create-pruned-monorepo";

import { isContentRelayProjectName, monorepoPackagePrefix } from "@content-relay/pkg-management";

const program = new commander.Command()
  .addOption(
    new commander.Option("--project-name <project-name>")
      .makeOptionMandatory()
      .argParser((value) => {
        if (!isContentRelayProjectName(value)) {
          throw new commander.InvalidArgumentError(`Must be a valid project name, but is not.`);
        }
        return value;
      }),
  )
  .addOption(
    new commander.Option("--linked-monorepo-dir-name <directory-name>").makeOptionMandatory(),
  )
  .addOption(new commander.Option("--target-dir <path>").makeOptionMandatory());
program.parse();
const opts = program.opts();

await createPrunedMonorepo({
  ...opts,
  monorepoPackagePrefix,
  monorepoRootProjectName: "@content-relay/monorepo-root",
  projectNames: [opts.projectName],
});
