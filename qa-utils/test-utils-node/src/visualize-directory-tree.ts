import fs from "node:fs";
import path from "node:path";

export async function visualizeDirectoryTree(directoryPath: string): Promise<string> {
  const lines = ["./"];
  const children = await listDirectoryEntries(directoryPath);

  for (const [index, child] of children.entries()) {
    await appendDirectoryTreeEntry({
      entryPath: path.join(directoryPath, child.name),
      isLast: index === children.length - 1,
      lines,
      prefix: "",
    });
  }

  return `${lines.join("\n")}\n`;
}

async function appendDirectoryTreeEntry({
  entryPath,
  isLast,
  lines,
  prefix,
}: {
  entryPath: string;
  isLast: boolean;
  lines: string[];
  prefix: string;
}): Promise<void> {
  const stats = await fs.promises.lstat(entryPath);
  const name = path.basename(entryPath);
  const connector = isLast ? "└── " : "├── ";

  if (stats.isSymbolicLink()) {
    lines.push(`${prefix}${connector}${name} --> ${await fs.promises.readlink(entryPath)}`);
    return;
  }

  lines.push(`${prefix}${connector}${name}`);

  if (!stats.isDirectory()) {
    return;
  }

  const children = await listDirectoryEntries(entryPath);
  const childPrefix = `${prefix}${isLast ? "    " : "│   "}`;

  for (const [index, child] of children.entries()) {
    await appendDirectoryTreeEntry({
      entryPath: path.join(entryPath, child.name),
      isLast: index === children.length - 1,
      lines,
      prefix: childPrefix,
    });
  }
}

async function listDirectoryEntries(directoryPath: string): Promise<fs.Dirent[]> {
  const entries = await fs.promises.readdir(directoryPath, { withFileTypes: true });

  // toSorted is unavailable with this package's ES2020 TypeScript target.
  // oxlint-disable-next-line unicorn/no-array-sort
  return entries.sort((left, right) => {
    if (left.isDirectory() !== right.isDirectory()) {
      return left.isDirectory() ? -1 : 1;
    }

    return left.name.localeCompare(right.name);
  });
}
