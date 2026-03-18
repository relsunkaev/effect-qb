import type * as Expression from "../../expression.ts"

const type = <Kind extends string>(kind: Kind): Expression.DbType.Base<"postgres", Kind> => ({
  dialect: "postgres",
  kind
})

export interface PostgresDatatypeModule {
  readonly text: () => Expression.DbType.PgText
  readonly varchar: () => Expression.DbType.PgVarchar
  readonly char: () => Expression.DbType.PgChar
  readonly citext: () => Expression.DbType.PgCitext
  readonly uuid: () => Expression.DbType.PgUuid
  readonly int2: () => Expression.DbType.PgInt2
  readonly int4: () => Expression.DbType.PgInt4
  readonly int8: () => Expression.DbType.PgInt8
  readonly numeric: () => Expression.DbType.PgNumeric
  readonly float4: () => Expression.DbType.PgFloat4
  readonly float8: () => Expression.DbType.PgFloat8
  readonly boolean: () => Expression.DbType.PgBool
  readonly date: () => Expression.DbType.PgDate
  readonly time: () => Expression.DbType.PgTime
  readonly timestamp: () => Expression.DbType.PgTimestamp
  readonly interval: () => Expression.DbType.PgInterval
  readonly bytea: () => Expression.DbType.PgBytea
  readonly json: () => Expression.DbType.Json<"postgres", "json">
  readonly jsonb: () => Expression.DbType.PgJsonb
}

export const postgresDatatypes: PostgresDatatypeModule = {
  text: () => type("text"),
  varchar: () => type("varchar"),
  char: () => type("char"),
  citext: () => type("citext"),
  uuid: () => type("uuid"),
  int2: () => type("int2"),
  int4: () => type("int4"),
  int8: () => type("int8"),
  numeric: () => type("numeric"),
  float4: () => type("float4"),
  float8: () => type("float8"),
  boolean: () => type("bool"),
  date: () => type("date"),
  time: () => type("time"),
  timestamp: () => type("timestamp"),
  interval: () => type("interval"),
  bytea: () => type("bytea"),
  json: () => type("json"),
  jsonb: () => type("jsonb")
}
