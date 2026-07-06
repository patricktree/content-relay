import childProcess from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import util from "node:util";

const execFile = util.promisify(childProcess.execFile);

export async function createTemporaryGitRepository(): Promise<string> {
  const repoPath = await fs.promises.mkdtemp(path.join(os.tmpdir(), "temporary-test-repo-"));
  await execGit(repoPath, ["init", "--initial-branch", "dev"]);
  await execGit(repoPath, ["config", "user.name", "test-git-author-name"]);
  await execGit(repoPath, ["config", "user.email", "test-git-author@example.com"]);
  return repoPath;
}

export async function execGit(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFile("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "test-git-author-name",
      GIT_AUTHOR_EMAIL: "test-git-author@example.com",
      GIT_COMMITTER_NAME: "test-git-committer-name",
      GIT_COMMITTER_EMAIL: "test-git-committer@example.com",
    },
  });

  return stdout;
}

export async function commitAll(cwd: string, message: string): Promise<string> {
  await execGit(cwd, ["add", "."]);
  await execGit(cwd, ["commit", "-m", message]);
  return (await execGit(cwd, ["rev-parse", "HEAD"])).trim();
}
