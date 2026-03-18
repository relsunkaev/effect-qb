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

const postgresQuery = makeDialectQuery({
  dialect: "postgres",
  textDb: { dialect: "postgres", kind: "text" } as Expression.DbType.PgText,
  numericDb: { dialect: "postgres", kind: "numeric" } as Expression.DbType.PgNumeric,
  boolDb: { dialect: "postgres", kind: "bool" } as Expression.DbType.PgBool,
  timestampDb: { dialect: "postgres", kind: "timestamp" } as Expression.DbType.PgTimestamp,
  nullDb: { dialect: "postgres", kind: "null" } as Expression.DbType.Base<"postgres", "null">
})

export const literal = postgresQuery.literal
export const eq = postgresQuery.eq
export const neq = postgresQuery.neq
export const lt = postgresQuery.lt
export const lte = postgresQuery.lte
export const gt = postgresQuery.gt
export const gte = postgresQuery.gte
export const isNull = postgresQuery.isNull
export const isNotNull = postgresQuery.isNotNull
export const upper = postgresQuery.upper
export const lower = postgresQuery.lower
export const like = postgresQuery.like
export const ilike = postgresQuery.ilike
export const and = postgresQuery.and
export const or = postgresQuery.or
export const not = postgresQuery.not
const case_ = postgresQuery.case
export const coalesce = postgresQuery.coalesce
export const in_ = postgresQuery.in
export const between = postgresQuery.between
export const concat = postgresQuery.concat
export const exists = postgresQuery.exists
export const count = postgresQuery.count
export const max = postgresQuery.max
export const min = postgresQuery.min
export const as = postgresQuery.as
export const with_ = postgresQuery.with
export const select = postgresQuery.select
export const where = postgresQuery.where
export const having = postgresQuery.having
export const from = postgresQuery.from
export const innerJoin = postgresQuery.innerJoin
export const leftJoin = postgresQuery.leftJoin
export const orderBy = postgresQuery.orderBy
export const groupBy = postgresQuery.groupBy
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
