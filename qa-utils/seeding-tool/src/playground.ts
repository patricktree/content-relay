import { seed } from "#pkg/seed.ts";

await seed.registerDevices("http://127.0.0.1:4000", [
  { nickname: "test-device-browser", platform: "android" },
  { nickname: "test-device-generic", platform: "cli" },
]);
