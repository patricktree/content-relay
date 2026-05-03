import { instrumentationScopeFromModuleURLAndRootURL } from "@content-relay/o11y.node-sdk";

const rootURL = new URL("../../", import.meta.url);

export function instrumentationScopeFromModuleURL(moduleURL: string | URL): string {
  return instrumentationScopeFromModuleURLAndRootURL(moduleURL, rootURL);
}
