import * as Expression from "../expression.ts"
import {
  type CompletePlan,
  type DialectCompatiblePlan,
  type EffectiveNullability,
  type ExpressionInput,
  type GroupByInput,
  type HavingPredicateInput,
  type OrderDirection,
  type OutputOfExpression,
  type OutputOfSelection,
  type PredicateInput,
  type QueryPlan,
  type ResultRow,
  type ResultRows,
  type RuntimeResultRow,
  type RuntimeResultRows,
  type StringExpressionInput
} from "../query.ts"
import { makeDialectQuery } from "../internal/query-factory.ts"

const mysqlQuery = makeDialectQuery({
  dialect: "mysql",
  textDb: { dialect: "mysql", kind: "text" } as Expression.DbType.MySqlText,
  numericDb: { dialect: "mysql", kind: "decimal" } as Expression.DbType.MySqlNumeric,
  boolDb: { dialect: "mysql", kind: "boolean" } as Expression.DbType.MySqlBool,
  timestampDb: { dialect: "mysql", kind: "timestamp" } as Expression.DbType.MySqlTimestamp,
  nullDb: { dialect: "mysql", kind: "null" } as Expression.DbType.Base<"mysql", "null">
})

export const literal = mysqlQuery.literal
export const eq = mysqlQuery.eq
export const isNull = mysqlQuery.isNull
export const isNotNull = mysqlQuery.isNotNull
export const upper = mysqlQuery.upper
export const lower = mysqlQuery.lower
export const and = mysqlQuery.and
export const or = mysqlQuery.or
export const not = mysqlQuery.not
const case_ = mysqlQuery.case
export const coalesce = mysqlQuery.coalesce
export const concat = mysqlQuery.concat
export const count = mysqlQuery.count
export const max = mysqlQuery.max
export const min = mysqlQuery.min
export const as = mysqlQuery.as
export const select = mysqlQuery.select
export const where = mysqlQuery.where
export const having = mysqlQuery.having
export const from = mysqlQuery.from
export const innerJoin = mysqlQuery.innerJoin
export const leftJoin = mysqlQuery.leftJoin
export const orderBy = mysqlQuery.orderBy
export const groupBy = mysqlQuery.groupBy
export { case_ as case }

export type {
  CompletePlan,
  DialectCompatiblePlan,
  EffectiveNullability,
  ExpressionInput,
  GroupByInput,
  HavingPredicateInput,
  OrderDirection,
  OutputOfExpression,
  OutputOfSelection,
  PredicateInput,
  QueryPlan,
  ResultRow,
  ResultRows,
  RuntimeResultRow,
  RuntimeResultRows,
  StringExpressionInput
}
