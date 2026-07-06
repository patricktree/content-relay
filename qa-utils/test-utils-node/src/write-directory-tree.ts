import fs from "node:fs";
import path from "node:path";

export async function writeDirectoryTree(
  directoryPath: string,
  tree: string,
  files: Record<string, string> = {},
): Promise<void> {
  const entries = parseDirectoryTree(tree);
  const entryByPath = new Map(entries.map((entry) => [entry.relativePath, entry]));
  const normalizedFiles: Record<string, string> = {};

  for (const [relativePath, contents] of Object.entries(files)) {
    const normalizedRelativePath = normalizeRelativePath(relativePath);
    const entry = entryByPath.get(normalizedRelativePath);

    if (!entry) {
      throw new Error(`Expected file contents path to exist in directory tree: ${relativePath}`);
    }

    if (entry.kind !== "file") {
      throw new Error(`Expected file contents path to reference a file: ${relativePath}`);
    }

    normalizedFiles[normalizedRelativePath] = contents;
  }

  for (const entry of entries) {
    if (entry.kind !== "file") {
      continue;
    }

    if (!hasOwn(normalizedFiles, entry.relativePath)) {
      throw new Error(`Expected file contents for directory tree file: ${entry.relativePath}`);
    }
  }

  await fs.promises.mkdir(directoryPath, { recursive: true });

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.relativePath);

    if (entry.kind !== "directory") {
      continue;
    }

    await fs.promises.mkdir(entryPath, { recursive: true });
  }

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.relativePath);

    if (entry.kind === "directory") {
      continue;
    }

    await fs.promises.mkdir(path.dirname(entryPath), { recursive: true });

    if (entry.kind === "symlink") {
      await fs.promises.symlink(entry.symlinkTarget, entryPath);
      continue;
    }

    const contents = normalizedFiles[entry.relativePath];

    if (contents === undefined) {
      throw new Error(`Expected file contents for directory tree file: ${entry.relativePath}`);
    }

    await fs.promises.writeFile(entryPath, contents);
  }
}

type ParsedDirectoryTreeEntry =
  | {
      kind: "directory" | "file";
      relativePath: string;
    }
  | {
      kind: "symlink";
      relativePath: string;
      symlinkTarget: string;
    };

type ParsedDirectoryTreeLine = {
  depth: number;
  name: string;
  symlinkTarget?: string;
};

function parseDirectoryTree(tree: string): ParsedDirectoryTreeEntry[] {
  const parsedLines = normalizeTreeLines(tree).map(parseDirectoryTreeLine);
  const pathSegments: string[] = [];

  return parsedLines.map((line, index) => {
    const nextLine = parsedLines[index + 1];
    const hasChildren = nextLine ? nextLine.depth > line.depth : false;

    if (line.symlinkTarget && hasChildren) {
      throw new Error(`Expected symlink to be a leaf entry: ${line.name}`);
    }

    pathSegments[line.depth] = line.name;
    pathSegments.length = line.depth + 1;

    const relativePath = pathSegments.join("/");

    if (line.symlinkTarget) {
      return {
        kind: "symlink",
        relativePath,
        symlinkTarget: line.symlinkTarget,
      };
    }

    return {
      kind: hasChildren ? "directory" : "file",
      relativePath,
    };
  });
}

function normalizeTreeLines(tree: string): string[] {
  const nonEmptyLines = tree.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const indentationLengths = nonEmptyLines.map((line) => line.match(/^ */)?.[0].length ?? 0);
  const commonIndentationLength = Math.min(...indentationLengths);
  const lines = nonEmptyLines.map((line) => line.slice(commonIndentationLength).trimEnd());

  if (lines[0]?.startsWith('"')) {
    lines[0] = lines[0].slice(1);
  }

  const lastLine = lines[lines.length - 1];

  if (lastLine === '"') {
    lines.pop();
  } else if (lastLine?.endsWith('"')) {
    lines[lines.length - 1] = lastLine.slice(0, -1);
  }

  return lines.filter((line) => line !== "./");
}

function parseDirectoryTreeLine(line: string): ParsedDirectoryTreeLine {
  const branchConnectorIndex = line.indexOf("├── ");
  const lastConnectorIndex = line.indexOf("└── ");
  const connectorIndex = branchConnectorIndex === -1 ? lastConnectorIndex : branchConnectorIndex;

  if (connectorIndex === -1) {
    throw new Error(`Expected directory tree line to contain a tree connector: ${line}`);
  }

  if (connectorIndex % 4 !== 0) {
    throw new Error(`Expected directory tree indentation to use four-character levels: ${line}`);
  }

  const depth = connectorIndex / 4;
  const entry = line.slice(connectorIndex + "├── ".length);
  const [name, symlinkTarget] = entry.split(" --> ");

  if (!name) {
    throw new Error(`Expected directory tree line to contain an entry name: ${line}`);
  }

  if (symlinkTarget) {
    return { depth, name, symlinkTarget };
  }

  return { depth, name };
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath.replace(/^\.\//, "").split(path.sep).join("/");
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}
