import { makeDatatypeModule, type DatatypeModule } from "../../internal/datatypes/define.js"
import type * as Expression from "../../internal/scalar.js"
import { sqliteDatatypeFamilies, sqliteDatatypeKinds } from "./spec.js"

const baseDatatypes = makeDatatypeModule("sqlite", sqliteDatatypeKinds, sqliteDatatypeFamilies)

const sqliteDatatypeModule = {
  ...baseDatatypes,
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
  ...baseDatatypes.json(),
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
