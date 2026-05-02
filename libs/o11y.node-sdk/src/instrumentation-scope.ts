import path from "node:path";
import url from "node:url";

export function instrumentationScopeFromModuleURLAndRootURL(
  moduleURL: string | URL,
  rootURL: string | URL,
): string {
  return path.relative(url.fileURLToPath(moduleURL), url.fileURLToPath(rootURL));
}
