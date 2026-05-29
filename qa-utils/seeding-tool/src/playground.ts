import { seed } from "#pkg/seed.ts";

await seed.registerDevices("http://127.0.0.1:4000", [
  { nickname: "test-device-android", platform: "android" },
  { nickname: "test-device-macbook-pro", platform: "android" },
  { nickname: "test-device-generic", platform: "cli" },
]);
