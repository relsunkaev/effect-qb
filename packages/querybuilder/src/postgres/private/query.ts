import * as Expression from "../../internal/expression.js"
import { makeDialectQuery } from "../../internal/query-factory.js"
import { postgresDatatypes } from "../datatypes/index.js"

export const postgresQuery = makeDialectQuery({
  dialect: "postgres",
  textDb: { dialect: "postgres", kind: "text" } as Expression.DbType.PgText,
  numericDb: { dialect: "postgres", kind: "float8" } as Expression.DbType.PgFloat8,
  boolDb: { dialect: "postgres", kind: "bool" } as Expression.DbType.PgBool,
  timestampDb: { dialect: "postgres", kind: "timestamp" } as Expression.DbType.PgTimestamp,
  nullDb: { dialect: "postgres", kind: "null" } as Expression.DbType.Base<"postgres", "null">,
  type: postgresDatatypes
})
