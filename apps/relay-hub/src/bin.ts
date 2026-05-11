// OpenTelemetry must initialize before the rest of the application module graph.
// The static import runs instrumentation setup first, and the dynamic import then
// starts a fresh ESM evaluation phase for the actual Relay Hub entrypoint.
import "#pkg/observability/instrumentation.ts";

await import("#pkg/bin-main.ts");
