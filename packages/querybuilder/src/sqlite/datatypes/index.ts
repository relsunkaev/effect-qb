import type { DatatypeModule } from "../../internal/datatypes/define.js"
import type * as Expression from "../../internal/scalar.js"
import type { NonEmptyStringInput } from "../../internal/table-options.js"
import { sqliteDatatypeFamilies, sqliteDatatypeKinds } from "./spec.js"

const withMetadata = <Kind extends keyof typeof sqliteDatatypeKinds & string>(
  kind: Kind
): Expression.DbType.Base<"sqlite", Kind> => {
  const kindSpec = sqliteDatatypeKinds[kind]
  const familySpec = sqliteDatatypeFamilies[kindSpec.family as keyof typeof sqliteDatatypeFamilies]
  return {
    dialect: "sqlite",
    kind,
    family: kindSpec.family,
    runtime: kindSpec.runtime,
    compareGroup: familySpec?.compareGroup,
    castTargets: familySpec?.castTargets,
    traits: familySpec?.traits
  }
}

const sqliteDatatypeModule = {
  custom: <Kind extends string>(kind: NonEmptyStringInput<Kind>) => ({
    dialect: "sqlite",
    kind: kind as Kind
  }),
  uuid: () => ({
    dialect: "sqlite",
    kind: "uuid",
    family: "uuid",
    runtime: "string",
    compareGroup: "uuid",
    castTargets: ["uuid", "char", "varchar", "text"],
    traits: {
      textual: true
    }
  })
} as Record<string, (...args: readonly any[]) => Expression.DbType.Base<"sqlite", string>>

for (const kind of Object.keys(sqliteDatatypeKinds)) {
  sqliteDatatypeModule[kind] = () => withMetadata(kind as keyof typeof sqliteDatatypeKinds & string)
}

type SqliteUuidWitness = Expression.DbType.Base<"sqlite", "uuid"> & {
  readonly family: "uuid"
  readonly runtime: "string"
  readonly compareGroup: "uuid"
  readonly castTargets: readonly ["uuid", "char", "varchar", "text"]
  readonly traits: {
    readonly textual: true
  }
}

type SqliteJsonWitness = Expression.DbType.Base<"sqlite", "json"> & {
  readonly family: "json"
  readonly runtime: "json"
  readonly compareGroup: "json"
  readonly castTargets: readonly ["json", "text"]
  readonly driverValueMapping: {
    readonly toDriver: (value: unknown) => unknown
  }
}

sqliteDatatypeModule.json = () => ({
  ...withMetadata("json"),
  driverValueMapping: {
    toDriver: (value: unknown) => JSON.stringify(value)
  }
}) as SqliteJsonWitness

export const sqliteDatatypes = sqliteDatatypeModule as DatatypeModule<
  "sqlite",
  typeof sqliteDatatypeKinds,
  typeof sqliteDatatypeFamilies
> & {
  readonly uuid: () => SqliteUuidWitness
  readonly json: () => SqliteJsonWitness
}

export type SqliteDatatypeModule = typeof sqliteDatatypes
