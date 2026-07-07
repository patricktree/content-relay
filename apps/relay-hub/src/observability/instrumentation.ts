import { setupNodeObservabilitySDK } from "@patricktree-stack/o11y.node-sdk";

await setupNodeObservabilitySDK({ serviceName: "@content-relay/relay-hub" });
