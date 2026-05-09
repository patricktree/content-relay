import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import type { DownloadDeliveryResponse } from "@content-relay/contracts";

export async function writeDownloadedDelivery(
  download: DownloadDeliveryResponse,
  outPath?: string,
): Promise<string[]> {
  const outputPaths: string[] = [];
  const isSingleFile = download.files.length === 1;
  const baseOutputPath =
    outPath ?? (isSingleFile ? process.cwd() : path.join(process.cwd(), download.item.itemId));

  if (isSingleFile) {
    const file = download.files[0];

    if (file === undefined) {
      throw new Error("Expected a single file in the delivery download response.");
    }

    const filePath =
      outPath !== undefined && path.extname(outPath) !== ""
        ? outPath
        : path.join(baseOutputPath, file.fileName);

    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, Buffer.from(file.base64Content, "base64"));
    outputPaths.push(filePath);

    return outputPaths;
  }

  await fs.promises.mkdir(baseOutputPath, { recursive: true });
  for (const file of download.files) {
    const filePath = path.join(baseOutputPath, file.fileName);
    await fs.promises.writeFile(filePath, Buffer.from(file.base64Content, "base64"));
    outputPaths.push(filePath);
  }

  return outputPaths;
}
