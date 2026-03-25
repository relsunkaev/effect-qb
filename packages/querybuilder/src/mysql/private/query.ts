import * as Expression from "../../internal/expression.js"
import { makeDialectQuery } from "../../internal/query-factory.js"
import { mysqlDatatypes } from "../datatypes/index.js"

export const mysqlQuery = makeDialectQuery({
  dialect: "mysql",
  textDb: { dialect: "mysql", kind: "text" } as Expression.DbType.MySqlText,
  numericDb: { dialect: "mysql", kind: "double" } as Expression.DbType.MySqlDouble,
  boolDb: { dialect: "mysql", kind: "boolean" } as Expression.DbType.MySqlBool,
  timestampDb: { dialect: "mysql", kind: "timestamp" } as Expression.DbType.MySqlTimestamp,
  nullDb: { dialect: "mysql", kind: "null" } as Expression.DbType.Base<"mysql", "null">,
  type: mysqlDatatypes
})
