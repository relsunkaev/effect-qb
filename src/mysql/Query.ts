import * as Expression from "../expression.ts"
import {
  type CapabilitiesOfPlan,
  type CompletePlan,
  type DialectCompatiblePlan,
  type DerivedSourceRequiredError,
  type CteSource,
  type EffectiveNullability,
  type ExpressionInput,
  type GroupByInput,
  type MergeCapabilities,
  type MergeCapabilityTuple,
  type HavingPredicateInput,
  type OrderDirection,
  type OutputOfExpression,
  type OutputOfSelection,
  type PredicateInput,
  type QueryCapability,
  type QueryPlan,
  type QueryRequirement,
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
export const neq = mysqlQuery.neq
export const lt = mysqlQuery.lt
export const lte = mysqlQuery.lte
export const gt = mysqlQuery.gt
export const gte = mysqlQuery.gte
export const isNull = mysqlQuery.isNull
export const isNotNull = mysqlQuery.isNotNull
export const upper = mysqlQuery.upper
export const lower = mysqlQuery.lower
export const like = mysqlQuery.like
export const ilike = mysqlQuery.ilike
export const and = mysqlQuery.and
export const or = mysqlQuery.or
export const not = mysqlQuery.not
const case_ = mysqlQuery.case
export const coalesce = mysqlQuery.coalesce
export const in_ = mysqlQuery.in
export const between = mysqlQuery.between
export const concat = mysqlQuery.concat
export const exists = mysqlQuery.exists
export const count = mysqlQuery.count
export const max = mysqlQuery.max
export const min = mysqlQuery.min
export const as = mysqlQuery.as
export const with_ = mysqlQuery.with
export const select = mysqlQuery.select
export const where = mysqlQuery.where
export const having = mysqlQuery.having
export const from = mysqlQuery.from
export const innerJoin = mysqlQuery.innerJoin
export const leftJoin = mysqlQuery.leftJoin
export const orderBy = mysqlQuery.orderBy
export const groupBy = mysqlQuery.groupBy
export { case_ as case }
export { in_ as in }
export { with_ as with }

export type {
  CapabilitiesOfPlan,
  CompletePlan,
  DialectCompatiblePlan,
  DerivedSourceRequiredError,
  CteSource,
  EffectiveNullability,
  ExpressionInput,
  GroupByInput,
  MergeCapabilities,
  MergeCapabilityTuple,
  HavingPredicateInput,
  OrderDirection,
  OutputOfExpression,
  OutputOfSelection,
  PredicateInput,
  QueryCapability,
  QueryPlan,
  QueryRequirement,
  ResultRow,
  ResultRows,
  RuntimeResultRow,
  RuntimeResultRows,
  StringExpressionInput
}

export { union_query_capabilities } from "../query.ts"
