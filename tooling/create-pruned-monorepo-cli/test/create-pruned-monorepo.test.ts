import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";

import { visualizeDirectoryTree, writeDirectoryTree } from "@content-relay/test-utils-node";

import { createPrunedMonorepo } from "#src/create-pruned-monorepo.ts";

const originalCwd = process.cwd();
const temporaryDirs: string[] = [];

afterEach(async () => {
  process.chdir(originalCwd);

  await Promise.all(
    temporaryDirs
      .splice(0)
      .map((directoryPath) => fs.promises.rm(directoryPath, { force: true, recursive: true })),
  );
});

test("copies the selected project, production workspace dependencies, and monorepo root files", async () => {
  const monorepoDir = await createTemporaryDirectory();
  const prunedMonorepoDir = await createTemporaryDirectory();

  await writeDirectoryTree(
    monorepoDir,
    `
      ./
      ├── packages
      │   ├── app
      │   │   ├── public
      │   │   │   └── visible.txt
      │   │   ├── src
      │   │   │   └── index.ts
      │   │   ├── README.md
      │   │   └── package.json
      │   ├── dev-helper
      │   │   ├── src
      │   │   │   └── index.ts
      │   │   └── package.json
      │   └── shared
      │       ├── src
      │       │   └── index.ts
      │       └── package.json
      ├── package.json
      ├── pnpm-workspace.yaml
      └── root-file.txt
    `,
    {
      "package.json": json({
        name: "@content-relay/monorepo-root",
        private: true,
        files: ["pnpm-workspace.yaml", "root-file.txt"],
      }),
      "packages/app/README.md": "# App\n",
      "packages/app/package.json": json({
        name: "@content-relay/app",
        private: true,
        files: ["src", "public/*.txt"],
        dependencies: { "@content-relay/shared": "workspace:*" },
        devDependencies: { "@content-relay/dev-helper": "workspace:*" },
      }),
      "packages/app/public/visible.txt": "visible\n",
      "packages/app/src/index.ts": "export {};\n",
      "packages/dev-helper/package.json": json({
        name: "@content-relay/dev-helper",
        private: true,
        files: ["src"],
      }),
      "packages/dev-helper/src/index.ts": "export {};\n",
      "packages/shared/package.json": json({
        name: "@content-relay/shared",
        private: true,
        files: ["src"],
      }),
      "packages/shared/src/index.ts": "export {};\n",
      "pnpm-workspace.yaml": 'packages:\n  - "packages/*"\n',
      "root-file.txt": "root file\n",
    },
  );

  process.chdir(monorepoDir);
  await createPrunedMonorepo({ projectName: "@content-relay/app", targetDir: prunedMonorepoDir });

  expect(await visualizeDirectoryTree(prunedMonorepoDir)).toMatchInlineSnapshot(`
    "./
    ├── packages
    │   ├── app
    │   │   ├── public
    │   │   │   └── visible.txt
    │   │   ├── src
    │   │   │   └── index.ts
    │   │   └── package.json
    │   └── shared
    │       ├── src
    │       │   └── index.ts
    │       └── package.json
    ├── package.json
    ├── pnpm-workspace.yaml
    └── root-file.txt
    "
  `);
});

test("throws when an included project does not declare package files", async () => {
  const monorepoDir = await createTemporaryDirectory();
  const prunedMonorepoDir = await createTemporaryDirectory();

  await writeDirectoryTree(
    monorepoDir,
    `
      ./
      ├── packages
      │   └── app
      │       ├── src
      │       │   └── index.ts
      │       └── package.json
      ├── package.json
      └── pnpm-workspace.yaml
    `,
    {
      "package.json": json({
        name: "@content-relay/monorepo-root",
        private: true,
        files: ["pnpm-workspace.yaml"],
      }),
      "packages/app/package.json": json({
        name: "@content-relay/app",
        private: true,
      }),
      "packages/app/src/index.ts": "export {};\n",
      "pnpm-workspace.yaml": 'packages:\n  - "packages/*"\n',
    },
  );

  process.chdir(monorepoDir);
  await expect(
    createPrunedMonorepo({ projectName: "@content-relay/app", targetDir: prunedMonorepoDir }),
  ).rejects.toThrow('Expected project @content-relay/app to have "files" field');
});

test("copies transitive production workspace dependencies", async () => {
  const monorepoDir = await createTemporaryDirectory();
  const prunedMonorepoDir = await createTemporaryDirectory();

  await writeDirectoryTree(
    monorepoDir,
    `
      ./
      ├── packages
      │   ├── app
      │   │   ├── src
      │   │   │   └── index.ts
      │   │   └── package.json
      │   ├── shared
      │   │   ├── src
      │   │   │   └── index.ts
      │   │   └── package.json
      │   └── util
      │       ├── src
      │       │   └── index.ts
      │       └── package.json
      ├── package.json
      └── pnpm-workspace.yaml
    `,
    {
      "package.json": json({
        name: "@content-relay/monorepo-root",
        private: true,
        files: ["pnpm-workspace.yaml"],
      }),
      "packages/app/package.json": json({
        name: "@content-relay/app",
        private: true,
        files: ["src"],
        dependencies: { "@content-relay/shared": "workspace:*" },
      }),
      "packages/app/src/index.ts": "export {};\n",
      "packages/shared/package.json": json({
        name: "@content-relay/shared",
        private: true,
        files: ["src"],
        dependencies: { "@content-relay/util": "workspace:*" },
      }),
      "packages/shared/src/index.ts": "export {};\n",
      "packages/util/package.json": json({
        name: "@content-relay/util",
        private: true,
        files: ["src"],
      }),
      "packages/util/src/index.ts": "export {};\n",
      "pnpm-workspace.yaml": 'packages:\n  - "packages/*"\n',
    },
  );

  process.chdir(monorepoDir);
  await createPrunedMonorepo({ projectName: "@content-relay/app", targetDir: prunedMonorepoDir });

  expect(await visualizeDirectoryTree(prunedMonorepoDir)).toMatchInlineSnapshot(`
    "./
    ├── packages
    │   ├── app
    │   │   ├── src
    │   │   │   └── index.ts
    │   │   └── package.json
    │   ├── shared
    │   │   ├── src
    │   │   │   └── index.ts
    │   │   └── package.json
    │   └── util
    │       ├── src
    │       │   └── index.ts
    │       └── package.json
    ├── package.json
    └── pnpm-workspace.yaml
    "
  `);
});

test("copies production workspace dependencies of the monorepo root", async () => {
  const monorepoDir = await createTemporaryDirectory();
  const prunedMonorepoDir = await createTemporaryDirectory();

  await writeDirectoryTree(
    monorepoDir,
    `
      ./
      ├── packages
      │   ├── app
      │   │   ├── src
      │   │   │   └── index.ts
      │   │   └── package.json
      │   └── build-config
      │       ├── config.json
      │       └── package.json
      ├── package.json
      └── pnpm-workspace.yaml
    `,
    {
      "package.json": json({
        name: "@content-relay/monorepo-root",
        private: true,
        files: ["pnpm-workspace.yaml"],
        dependencies: { "@content-relay/build-config": "workspace:*" },
      }),
      "packages/app/package.json": json({
        name: "@content-relay/app",
        private: true,
        files: ["src"],
      }),
      "packages/app/src/index.ts": "export {};\n",
      "packages/build-config/config.json": '{"extends":"@content-relay/base"}\n',
      "packages/build-config/package.json": json({
        name: "@content-relay/build-config",
        private: true,
        files: ["config.json"],
      }),
      "pnpm-workspace.yaml": 'packages:\n  - "packages/*"\n',
    },
  );

  process.chdir(monorepoDir);
  await createPrunedMonorepo({ projectName: "@content-relay/app", targetDir: prunedMonorepoDir });

  expect(await visualizeDirectoryTree(prunedMonorepoDir)).toMatchInlineSnapshot(`
    "./
    ├── packages
    │   ├── app
    │   │   ├── src
    │   │   │   └── index.ts
    │   │   └── package.json
    │   └── build-config
    │       ├── config.json
    │       └── package.json
    ├── package.json
    └── pnpm-workspace.yaml
    "
  `);
});

test("preserves matched symlinks instead of dereferencing them", async () => {
  const monorepoDir = await createTemporaryDirectory();
  const prunedMonorepoDir = await createTemporaryDirectory();

  await writeDirectoryTree(
    monorepoDir,
    `
      ./
      ├── packages
      │   └── app
      │       ├── src
      │       │   └── index.ts
      │       ├── index-link.ts --> src/index.ts
      │       └── package.json
      ├── package.json
      └── pnpm-workspace.yaml
    `,
    {
      "package.json": json({
        name: "@content-relay/monorepo-root",
        private: true,
        files: ["pnpm-workspace.yaml"],
      }),
      "packages/app/package.json": json({
        name: "@content-relay/app",
        private: true,
        files: ["src", "index-link.ts"],
      }),
      "packages/app/src/index.ts": "export {};\n",
      "pnpm-workspace.yaml": 'packages:\n  - "packages/*"\n',
    },
  );

  process.chdir(monorepoDir);
  await createPrunedMonorepo({ projectName: "@content-relay/app", targetDir: prunedMonorepoDir });

  expect(await visualizeDirectoryTree(prunedMonorepoDir)).toMatchInlineSnapshot(`
    "./
    ├── packages
    │   └── app
    │       ├── src
    │       │   └── index.ts
    │       ├── index-link.ts --> src/index.ts
    │       └── package.json
    ├── package.json
    └── pnpm-workspace.yaml
    "
  `);
});

test("excludes node_modules even when package files include it", async () => {
  const monorepoDir = await createTemporaryDirectory();
  const prunedMonorepoDir = await createTemporaryDirectory();

  await writeDirectoryTree(
    monorepoDir,
    `
      ./
      ├── packages
      │   └── app
      │       ├── node_modules
      │       │   └── ignored
      │       │       └── index.js
      │       ├── src
      │       │   └── index.ts
      │       └── package.json
      ├── package.json
      └── pnpm-workspace.yaml
    `,
    {
      "package.json": json({
        name: "@content-relay/monorepo-root",
        private: true,
        files: ["pnpm-workspace.yaml"],
      }),
      "packages/app/node_modules/ignored/index.js": "module.exports = {};\n",
      "packages/app/package.json": json({
        name: "@content-relay/app",
        private: true,
        files: ["src", "node_modules"],
      }),
      "packages/app/src/index.ts": "export {};\n",
      "pnpm-workspace.yaml": 'packages:\n  - "packages/*"\n',
    },
  );

  process.chdir(monorepoDir);
  await createPrunedMonorepo({ projectName: "@content-relay/app", targetDir: prunedMonorepoDir });

  expect(await visualizeDirectoryTree(prunedMonorepoDir)).toMatchInlineSnapshot(`
    "./
    ├── packages
    │   └── app
    │       ├── src
    │       │   └── index.ts
    │       └── package.json
    ├── package.json
    └── pnpm-workspace.yaml
    "
  `);
});

test("copies matched dotfiles and files inside matched dot directories", async () => {
  const monorepoDir = await createTemporaryDirectory();
  const prunedMonorepoDir = await createTemporaryDirectory();

  await writeDirectoryTree(
    monorepoDir,
    `
      ./
      ├── packages
      │   └── app
      │       ├── .config
      │       │   └── tool.json
      │       ├── src
      │       │   └── index.ts
      │       ├── .env.example
      │       └── package.json
      ├── package.json
      └── pnpm-workspace.yaml
    `,
    {
      "package.json": json({
        name: "@content-relay/monorepo-root",
        private: true,
        files: ["pnpm-workspace.yaml"],
      }),
      "packages/app/.config/tool.json": "{}\n",
      "packages/app/.env.example": "EXAMPLE=true\n",
      "packages/app/package.json": json({
        name: "@content-relay/app",
        private: true,
        files: ["src", ".env.example", ".config"],
      }),
      "packages/app/src/index.ts": "export {};\n",
      "pnpm-workspace.yaml": 'packages:\n  - "packages/*"\n',
    },
  );

  process.chdir(monorepoDir);
  await createPrunedMonorepo({ projectName: "@content-relay/app", targetDir: prunedMonorepoDir });

  expect(await visualizeDirectoryTree(prunedMonorepoDir)).toMatchInlineSnapshot(`
    "./
    ├── packages
    │   └── app
    │       ├── .config
    │       │   └── tool.json
    │       ├── src
    │       │   └── index.ts
    │       ├── .env.example
    │       └── package.json
    ├── package.json
    └── pnpm-workspace.yaml
    "
  `);
});

async function createTemporaryDirectory(): Promise<string> {
  const directoryPath = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pruned-monorepo-test-"));
  temporaryDirs.push(directoryPath);
  return directoryPath;
}

function json(value: Record<string, unknown>): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
