import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { createHonoApp } from "@content-relay/backend";

const OUTPUT_FILE_URL = new URL("../dist/content-relay-openapi.json", import.meta.url);

const app = await createHonoApp();
const response = await app.request("http://127.0.0.1/doc");

if (!response.ok) {
  throw new Error(
    `Failed to export the OpenAPI document: ${response.status} ${response.statusText}`,
  );
}

const openApiDocument = await response.json();
const outputPath = fileURLToPath(OUTPUT_FILE_URL);

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(openApiDocument, null, 2)}\n`);
