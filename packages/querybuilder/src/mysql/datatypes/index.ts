import { makeDatatypeModule, type DatatypeModule } from "../../internal/datatypes/define.js"
import type * as Expression from "../../internal/scalar.js"
import { mysqlDatatypeFamilies, mysqlDatatypeKinds } from "./spec.js"

const baseDatatypes = makeDatatypeModule("mysql", mysqlDatatypeKinds, mysqlDatatypeFamilies)

const mysqlDatatypeModule = {
  ...baseDatatypes,
  uuid: () => ({
    dialect: "mysql",
    kind: "uuid",
    family: "uuid",
    runtime: "string",
    compareGroup: "uuid",
    castTargets: ["uuid", "char", "varchar", "text"],
    traits: {
      textual: true
    }
  })
} as Record<string, (...args: readonly any[]) => Expression.DbType.Base<"mysql", string>>

type MysqlUuidWitness = Expression.DbType.Base<"mysql", "uuid"> & {
  readonly family: "uuid"
  readonly runtime: "string"
  readonly compareGroup: "uuid"
  readonly castTargets: readonly ["uuid", "char", "varchar", "text"]
  readonly traits: {
    readonly textual: true
  }
}

type MysqlJsonWitness = Expression.DbType.Base<"mysql", "json"> & {
  readonly family: "json"
  readonly runtime: "json"
  readonly compareGroup: "json"
  readonly castTargets: readonly ["json", "text"]
  readonly driverValueMapping: {
    readonly toDriver: (value: unknown) => unknown
  }
}

mysqlDatatypeModule.json = () => ({
  ...baseDatatypes.json(),
  driverValueMapping: {
    toDriver: (value: unknown) =>
      value !== null && typeof value === "object"
        ? JSON.stringify(value)
        : value
  }
}) as MysqlJsonWitness

export const mysqlDatatypes = mysqlDatatypeModule as DatatypeModule<
  "mysql",
  typeof mysqlDatatypeKinds,
  typeof mysqlDatatypeFamilies
> & {
  readonly uuid: () => MysqlUuidWitness
  readonly json: () => MysqlJsonWitness
}

export type MysqlDatatypeModule = typeof mysqlDatatypes
