import type * as Expression from "../../expression.ts"

const type = <Kind extends string>(kind: Kind): Expression.DbType.Base<"mysql", Kind> => ({
  dialect: "mysql",
  kind
})

export interface MysqlDatatypeModule {
  readonly text: () => Expression.DbType.MySqlText
  readonly varchar: () => Expression.DbType.MySqlVarchar
  readonly char: () => Expression.DbType.MySqlChar
  readonly uuid: () => Expression.DbType.MySqlUuid
  readonly tinyint: () => Expression.DbType.MySqlTinyInt
  readonly smallint: () => Expression.DbType.MySqlSmallInt
  readonly mediumint: () => Expression.DbType.MySqlMediumInt
  readonly int: () => Expression.DbType.MySqlInt
  readonly bigint: () => Expression.DbType.MySqlBigInt
  readonly decimal: () => Expression.DbType.MySqlNumeric
  readonly float: () => Expression.DbType.MySqlFloat
  readonly double: () => Expression.DbType.MySqlDouble
  readonly boolean: () => Expression.DbType.MySqlBool
  readonly date: () => Expression.DbType.MySqlDate
  readonly time: () => Expression.DbType.MySqlTime
  readonly datetime: () => Expression.DbType.MySqlDatetime
  readonly timestamp: () => Expression.DbType.MySqlTimestamp
  readonly binary: () => Expression.DbType.MySqlBinary
  readonly varbinary: () => Expression.DbType.MySqlVarBinary
  readonly blob: () => Expression.DbType.MySqlBlob
  readonly json: () => Expression.DbType.Json<"mysql", "json">
}

export const mysqlDatatypes: MysqlDatatypeModule = {
  text: () => type("text"),
  varchar: () => type("varchar"),
  char: () => type("char"),
  uuid: () => type("uuid"),
  tinyint: () => type("tinyint"),
  smallint: () => type("smallint"),
  mediumint: () => type("mediumint"),
  int: () => type("int"),
  bigint: () => type("bigint"),
  decimal: () => type("decimal"),
  float: () => type("float"),
  double: () => type("double"),
  boolean: () => type("boolean"),
  date: () => type("date"),
  time: () => type("time"),
  datetime: () => type("datetime"),
  timestamp: () => type("timestamp"),
  binary: () => type("binary"),
  varbinary: () => type("varbinary"),
  blob: () => type("blob"),
  json: () => type("json")
}
