import { setupNodeObservabilitySDK } from "@content-relay/o11y.node-sdk";

export const observabilitySdk = await setupNodeObservabilitySDK({
  serviceName: "@content-relay/relay-hub",
});
