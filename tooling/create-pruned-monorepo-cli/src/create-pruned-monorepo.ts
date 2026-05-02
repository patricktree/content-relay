import glob from "fast-glob";
import fs from "node:fs";
import path from "node:path";

import {
  type ContentRelayProjectName,
  filterWorkspaceProjects,
  findWorkspaceProjects,
  type Project,
} from "@content-relay/pkg-management";

type CreatePrunedMonorepoOptions = {
  projectName: ContentRelayProjectName;
  targetDir: string;
};

export async function createPrunedMonorepo({
  projectName,
  targetDir: prunedMonorepoDir,
}: CreatePrunedMonorepoOptions) {
  console.log(
    `creating pruned monorepo... projectName: ${projectName}, targetDir: ${prunedMonorepoDir}`,
  );

  console.log(`determining workspaces projects to copy...`);
  const projectsToInclude = await filterWorkspaceProjects({
    filter: [
      // include project and its workspace dependencies
      `${projectName}...`,
      // and monorepo root and its workspace dependencies
      "@content-relay/monorepo-root...",
    ],
    followProdDepsOnly: true,
  });

  console.log(
    `determined ${projectsToInclude.length} projects to copy, determining all files of them to copy...`,
  );
  const { monorepoRootDir } = await findWorkspaceProjects();
  const allFilesToCopy = (
    await Promise.all(
      projectsToInclude.map((project) =>
        getFilesToCopyForProject({
          project,
          monorepoRootDir,
          prunedMonorepoDir,
        }),
      ),
    )
  ).flat();

  console.log(`determined ${allFilesToCopy.length} files to copy, copying them...`);
  await Promise.all(
    allFilesToCopy.map(async ({ source, destination }) => {
      await fs.promises.mkdir(path.dirname(destination), { recursive: true });
      await fs.promises.cp(source, destination, { errorOnExist: true, verbatimSymlinks: true });
    }),
  );

  console.log(`copied all files!`);

  console.log(`pruned monorepo successfully created!`);
  return { prunedMonorepoDir };
}

/**
 * Determines the list of files to copy for a given project to the pruned monorepo directory. It
 * expects the `files` field in the project's `package.json` to be specified. It always includes the
 * `package.json` file and always excludes the `node_modules` directory.
 *
 * @param options - The options object.
 * @param options.project - The workspace project object.
 * @param options.monorepoRootDir - The absolute path to the original monorepo root directory.
 * @param options.prunedMonorepoDir - The absolute path to the temporary pruned monorepo directory.
 * @returns A promise that resolves to an array of objects, each containing the source and
 *   destination paths for a file to be copied.
 */
async function getFilesToCopyForProject({
  project,
  monorepoRootDir,
  prunedMonorepoDir,
}: {
  project: Project;
  monorepoRootDir: string;
  prunedMonorepoDir: string;
}) {
  /**
   * Determine the glob patterns based on the `files` field in `package.json`. Directory entries in
   * `files` are expanded to include all their contents (`dir/**\/*`).
   */
  if (!project.manifest.files) {
    throw new Error(
      `Expected project ${project.manifest.name} to have "files" field in its package.json, but it does not. Please add a "files" field to the package.json of project ${project.manifest.name} and specify the files to include in the pruned monorepo.`,
    );
  }

  const projectGlobPatterns = await Promise.all(
    project.manifest.files.map(async (pattern) => {
      const filePath = path.join(project.rootDir, pattern);
      let lstats: fs.Stats;
      try {
        lstats = await fs.promises.lstat(filePath);
      } catch {
        // If lstat fails (e.g., file doesn't exist, pattern is a glob, etc.), just use the pattern as is.
        return pattern;
      }
      if (lstats.isDirectory()) {
        // If it's a directory, append `/**/*` to include all its contents.
        return `${pattern}/**/*`;
      }
      // Otherwise, use the pattern as is.
      return pattern;
    }),
  );

  // Combine the derived patterns with mandatory patterns.
  const globPatternsToUse = [...projectGlobPatterns, "package.json", "!node_modules/**"];

  const relativeGlobbedPaths = await glob(globPatternsToUse, {
    cwd: project.rootDir,
    dot: true,
    // do not follow symlinks - we want to copy symlinks themselves, not the files/directories they point to
    followSymbolicLinks: false,
    // set "onlyFiles" to false to also include symlinks and directories in the result
    onlyFiles: false,
  });

  // we are not interested in directories, so we filter them out
  const relativePathsForFilesToPack = (
    await Promise.all(
      relativeGlobbedPaths.map(async (relativePathFileToPack) => {
        const absolutePathFileToPack = path.join(project.rootDir, relativePathFileToPack);
        const lstat = await fs.promises.lstat(absolutePathFileToPack);
        if (lstat.isDirectory()) {
          // If it's a directory, we don't want to copy it.
          return null;
        }
        return relativePathFileToPack;
      }),
    )
  ).filter((elem) => elem !== null);

  // Calculate the final source and destination paths for each file.
  const relativePathToProjectInMonorepo = path.relative(monorepoRootDir, project.rootDir);
  const absolutePathToProjectInPrunedMonorepo = path.join(
    prunedMonorepoDir,
    relativePathToProjectInMonorepo,
  );
  const filesToCopy = relativePathsForFilesToPack.map((relativePathFileToPack) => ({
    source: path.join(project.rootDir, relativePathFileToPack),
    destination: path.join(absolutePathToProjectInPrunedMonorepo, relativePathFileToPack),
  }));
  return filesToCopy;
}
