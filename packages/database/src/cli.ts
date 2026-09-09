#!/usr/bin/env node
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Command } from "effect/unstable/cli"
import * as Effect from "effect/Effect"
import * as Logger from "effect/Logger"

import { root } from "./commands.js"

Command.run(root, { version: "0.22.0" }).pipe(
  Effect.tapCause((cause) => Effect.logError(cause)),
  Effect.provideService(Logger.LogToStderr, true),
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain({ disableErrorReporting: true })
)
