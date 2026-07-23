import { NodePath, NodeServices } from "@effect/platform-node"
import * as Crypto from "effect/Crypto"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"

export type PlatformServices =
  | Crypto.Crypto
  | FileSystem.FileSystem
  | Path.Path

export const runNodePlatform = <A, E>(
  effect: Effect.Effect<A, E, PlatformServices>
): Promise<A> =>
  Effect.runPromise(Effect.provide(effect, NodeServices.layer))

export const runNodePath = <A, E>(
  effect: Effect.Effect<A, E, Path.Path>
): A =>
  Effect.runSync(Effect.provide(effect, NodePath.layer))
