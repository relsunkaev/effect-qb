import type { DatatypeModule } from "../../internal/datatypes/define.js"
import type * as Expression from "../../internal/scalar.js"
import type { NonEmptyStringInput } from "../../internal/table-options.js"
import { standardDatatypeFamilies, standardDatatypeKinds } from "./spec.js"

const withMetadata = <Kind extends keyof typeof standardDatatypeKinds & string>(
  kind: Kind
): Expression.DbType.Base<"standard", Kind> => {
  const kindSpec = standardDatatypeKinds[kind]
  const familySpec = standardDatatypeFamilies[kindSpec.family as keyof typeof standardDatatypeFamilies]
  return {
    dialect: "standard",
    kind,
    family: kindSpec.family,
    runtime: kindSpec.runtime,
    compareGroup: familySpec?.compareGroup,
    castTargets: familySpec?.castTargets,
    implicitTargets: (familySpec as { readonly implicitTargets?: readonly string[] }).implicitTargets,
    traits: familySpec?.traits
  }
}

const standardDatatypeModule = {
  custom: <Kind extends string>(kind: NonEmptyStringInput<Kind>) => ({
    dialect: "standard",
    kind: kind as Kind
  }),
  uuid: () => ({
    dialect: "standard",
    kind: "uuid",
    family: "uuid",
    runtime: "string",
    compareGroup: "uuid",
    castTargets: ["uuid", "char", "varchar", "text"],
    traits: {
      textual: true
    }
  })
} as Record<string, (...args: readonly any[]) => Expression.DbType.Base<"standard", string>>

for (const kind of Object.keys(standardDatatypeKinds)) {
  standardDatatypeModule[kind] = () => withMetadata(kind as keyof typeof standardDatatypeKinds & string)
}

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
  ...withMetadata("json"),
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
  }),
  float8: () => withMetadata("real")
}

export type StandardDatatypeModule = typeof standardDatatypes
