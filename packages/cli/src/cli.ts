#!/usr/bin/env node

// OpenTelemetry must initialize before the rest of the application module graph.
// The static import runs instrumentation setup first, and the dynamic import then
// starts a fresh ESM evaluation phase for the actual CLI entrypoint.
import "#pkg/observability/instrumentation.ts";

await import("#pkg/cli-main.ts");
