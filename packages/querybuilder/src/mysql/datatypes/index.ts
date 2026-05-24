import type { DatatypeModule } from "../../internal/datatypes/define.js"
import type * as Expression from "../../internal/scalar.js"
import type { NonEmptyStringInput } from "../../internal/table-options.js"
import { mysqlDatatypeFamilies, mysqlDatatypeKinds } from "./spec.js"

const withMetadata = <Kind extends keyof typeof mysqlDatatypeKinds & string>(
  kind: Kind
): Expression.DbType.Base<"mysql", Kind> => {
  const kindSpec = mysqlDatatypeKinds[kind]
  const familySpec = mysqlDatatypeFamilies[kindSpec.family as keyof typeof mysqlDatatypeFamilies]
  return {
    dialect: "mysql",
    kind,
    family: kindSpec.family,
    runtime: kindSpec.runtime,
    compareGroup: familySpec?.compareGroup,
    castTargets: familySpec?.castTargets,
    traits: familySpec?.traits
  }
}

const mysqlDatatypeModule = {
  custom: <Kind extends string>(kind: NonEmptyStringInput<Kind>) => ({
    dialect: "mysql",
    kind: kind as Kind
  }),
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

for (const kind of Object.keys(mysqlDatatypeKinds)) {
  mysqlDatatypeModule[kind] = () => withMetadata(kind as keyof typeof mysqlDatatypeKinds & string)
}

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
  ...withMetadata("json"),
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
