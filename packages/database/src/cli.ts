#!/usr/bin/env node
import { NodeRuntime } from "@effect/platform-node"
import { Command } from "effect/cli"
import * as Effect from "effect/Effect"
import * as Logger from "effect/Logger"

import { root } from "./commands.js"
import { nodePlatformLayer } from "./internal/node-platform.js"

Command.run(root, { version: "0.24.2" }).pipe(
  Effect.tapCause((cause) => Effect.logError(cause)),
  Effect.provideService(Logger.LogToStderr, true),
  Effect.provide(nodePlatformLayer),
  NodeRuntime.runMain({ disableErrorReporting: true })
)
