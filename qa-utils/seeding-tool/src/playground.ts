import { seed } from "#pkg/seed.ts";

// TODO: reset relay-hub (i.e. delete and recreate the data dir)
await seed.registerDevices("http://127.0.0.1:4000", [
  { nickname: "test-device-browser", platform: "android" },
  { nickname: "test-device-generic", platform: "cli" },
]);
