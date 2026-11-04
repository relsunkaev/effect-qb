import { NodeCrypto, NodePath, NodeServices } from "@effect/platform-node"
import { Digest } from "effect/crypto"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"

export type PlatformServices =
  | Digest.Digest
  | FileSystem.FileSystem
  | Path.Path

export const nodePlatformLayer = Layer.merge(NodeServices.layer, NodeCrypto.layerDigest)

export const runNodePlatform = <A, E>(
  effect: Effect.Effect<A, E, PlatformServices>
): Promise<A> =>
  Effect.runPromise(Effect.provide(effect, nodePlatformLayer))

export const runNodePath = <A, E>(
  effect: Effect.Effect<A, E, Path.Path>
): A =>
  Effect.runSync(Effect.provide(effect, NodePath.layer))
