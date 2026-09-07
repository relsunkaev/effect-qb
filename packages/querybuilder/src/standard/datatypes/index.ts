import { makeDatatypeModule, type DatatypeModule } from "../../internal/datatypes/define.js"
import type * as Expression from "../../internal/scalar.js"
import { standardDatatypeFamilies, standardDatatypeKinds } from "./spec.js"

const baseDatatypes = makeDatatypeModule("standard", standardDatatypeKinds, standardDatatypeFamilies)

const standardDatatypeModule = {
  ...baseDatatypes
} as Record<string, (...args: readonly any[]) => Expression.DbType.Base<"standard", string>>

type StandardUuidWitness = Expression.DbType.Base<"standard", "uuid"> & {
  readonly family: "uuid"
  readonly runtime: "string"
  readonly compareGroup: "uuid"
  readonly castTargets: readonly ["uuid", "char", "varchar", "text"]
  readonly traits: {
    readonly textual: true
  }
}

type StandardJsonWitness = Expression.DbType.Base<"standard", "json"> & {
  readonly family: "json"
  readonly runtime: "json"
  readonly compareGroup: "json"
  readonly castTargets: readonly ["json", "text"]
  readonly driverValueMapping: {
    readonly toDriver: (value: unknown) => unknown
  }
}

standardDatatypeModule.json = () => ({
  ...baseDatatypes.json(),
  driverValueMapping: {
    toDriver: (value: unknown) => JSON.stringify(value)
  }
}) as StandardJsonWitness

export const standardDatatypes = {
  ...(standardDatatypeModule as DatatypeModule<
    "standard",
    typeof standardDatatypeKinds,
    typeof standardDatatypeFamilies
  > & {
    readonly uuid: () => StandardUuidWitness
    readonly json: () => StandardJsonWitness
  })
}

export type StandardDatatypeModule = typeof standardDatatypes
