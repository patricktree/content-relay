import { Temporal } from "temporal-polyfill";

import type { IClock } from "#pkg/interfaces/clock.interface.ts";

export class SystemClock implements IClock {
  now(): string {
    return Temporal.Now.instant().toString();
  }

  addSeconds(timestamp: string, seconds: number): string {
    return Temporal.Instant.from(timestamp).add({ seconds }).toString();
  }
}
