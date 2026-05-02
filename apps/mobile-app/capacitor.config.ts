const path = require("node:path");

import type { CapacitorConfig } from "@capacitor/cli";

const pathToWebApp = require.resolve("@content-relay/web-app/package.json");
const pathToWebAppDist = path.join(pathToWebApp, "..", "./dist/web");

const config: CapacitorConfig = {
  appId: "me.patricktree.contentrelay",
  appName: "Content Relay",
  webDir: pathToWebAppDist,
};

module.exports = config;
