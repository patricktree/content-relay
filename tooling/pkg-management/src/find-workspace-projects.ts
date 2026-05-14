import { findWorkspaceDir } from "@pnpm/find-workspace-dir";
import { findWorkspacePackagesNoCheck } from "@pnpm/workspace.find-packages";
import * as yaml from "js-yaml";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

export type { Project } from "@pnpm/workspace.find-packages";

export async function findWorkspaceProjects(opts?: {
  workspaceRoot?: Parameters<typeof findWorkspacePackagesNoCheck>[0];
}) {
  const monorepoRootDir = await findWorkspaceDir(opts?.workspaceRoot ?? process.cwd());
  assert(monorepoRootDir);

  const pathToPnpmWorkspaceYaml = path.join(monorepoRootDir, "pnpm-workspace.yaml");
  const pnpmWorkspaceYaml = yaml.load(await fs.promises.readFile(pathToPnpmWorkspaceYaml, "utf-8"));
  assert(
    typeof pnpmWorkspaceYaml === "object" &&
      pnpmWorkspaceYaml !== null &&
      "packages" in pnpmWorkspaceYaml &&
      Array.isArray(pnpmWorkspaceYaml.packages),
  );

  const [rootProject, ...workspaceProjects] = await findWorkspacePackagesNoCheck(monorepoRootDir, {
    patterns: pnpmWorkspaceYaml.packages,
  });
  assert(rootProject);
  return { monorepoRootDir, rootProject, workspaceProjects };
}
