import { ConsoleLogRecordExporter, SimpleLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { processUtil } from "@patricktree/commons-node/utils/process";

const OBSERVABILITY_SHUTDOWN_WAIT_MS = 5_000;

export type SetupNodeObservabilitySDKOptions = {
  serviceName: string;
};
export type NodeObservabilitySDK = {
  shutdown(): Promise<void>;
};

export async function setupNodeObservabilitySDK(
  options: SetupNodeObservabilitySDKOptions,
): Promise<NodeObservabilitySDK> {
  const nodeSdk = new NodeSDK({
    serviceName: options.serviceName,
    logRecordProcessors: [
      new SimpleLogRecordProcessor({ exporter: new ConsoleLogRecordExporter() }),
    ],
  });
  nodeSdk.start();

  let shutdownPromise: Promise<void> | undefined;

  const shutdown = (): Promise<void> => {
    shutdownPromise ??= nodeSdk.shutdown();

    return shutdownPromise;
  };

  processUtil.asyncExitHook(async () => {
    await shutdown();
  }, OBSERVABILITY_SHUTDOWN_WAIT_MS);

  return {
    shutdown,
  };
}
