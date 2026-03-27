import type { DatatypeModule } from "../../internal/datatypes/define.js"
import type * as Expression from "../../internal/scalar.js"
import { mysqlDatatypeKinds } from "./spec.js"

const mysqlDatatypeModule = {
  custom: (kind: string) => ({
    dialect: "mysql",
    kind
  })
} as Record<string, (...args: readonly any[]) => Expression.DbType.Base<"mysql", string>>

for (const kind of Object.keys(mysqlDatatypeKinds)) {
  mysqlDatatypeModule[kind] = () => ({
    dialect: "mysql",
    kind
  })
}

export const mysqlDatatypes = mysqlDatatypeModule as DatatypeModule<"mysql", typeof mysqlDatatypeKinds>

export type MysqlDatatypeModule = typeof mysqlDatatypes
