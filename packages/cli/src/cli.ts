#!/usr/bin/env node

import { createCliStatusMessage } from "#pkg/index.ts";

process.stdout.write(`${createCliStatusMessage()}\n`);
