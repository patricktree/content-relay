import { filterPackages } from "@pnpm/filter-workspace-packages";
import assert from "node:assert";

import { findWorkspaceProjects, type Project } from "#pkg/find-workspace-projects.ts";
import { monorepoPackagePrefix } from "#pkg/helpers.ts";

/**
 * @param filter Pnpm-style filter, e.g. ["@content-relay/web-app...", "@content-relay/backend..."].
 *   See also https://pnpm.io/filtering.
 */
export const filterWorkspaceProjects = async (opts: {
  filter: string[];
  followProdDepsOnly: boolean;
}): Promise<Project[]> => {
  const { monorepoRootDir, rootProject, workspaceProjects } = await findWorkspaceProjects();

  const { selectedProjectsGraph, unmatchedFilters } = await filterPackages(
    [rootProject, ...workspaceProjects],
    opts.filter.map((filterElem) => ({
      filter: filterElem,
      followProdDepsOnly: opts.followProdDepsOnly,
    })),
    { workspaceDir: monorepoRootDir, prefix: `${monorepoPackagePrefix}/` },
  );
  assert(
    unmatchedFilters.length === 0,
    `no filter should have got 0 matches, but got some! unmatchedFilters=${JSON.stringify(
      unmatchedFilters,
    )}`,
  );

  return Object.values(selectedProjectsGraph).map((selectedProject) => selectedProject.package);
};
