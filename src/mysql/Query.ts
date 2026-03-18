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
  type MutationInputOf,
  type MutationTargetLike,
  type NumericExpressionInput,
  type PredicateInput,
  type QueryCapability,
  type QueryPlan,
  type QueryRequirement,
  type SetCompatiblePlan,
  type SetCompatibleRightPlan,
  type SetOperator,
  type QueryStatement,
  type ResultRow,
  type ResultRows,
  type RuntimeResultRow,
  type RuntimeResultRows,
  type SchemaTableLike,
  type SourceCapabilitiesOf,
  type SourceRequiredOf,
  type SourceRequirementError,
  type StatementOfPlan,
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
export const over = mysqlQuery.over
export const rowNumber = mysqlQuery.rowNumber
export const rank = mysqlQuery.rank
export const denseRank = mysqlQuery.denseRank
export const count = mysqlQuery.count
export const max = mysqlQuery.max
export const min = mysqlQuery.min
export const as = mysqlQuery.as
export const with_ = mysqlQuery.with
export const withRecursive = mysqlQuery.withRecursive
export const lateral = mysqlQuery.lateral
export const returning = mysqlQuery.returning
export const insert = mysqlQuery.insert
export const update = mysqlQuery.update
export const upsert = mysqlQuery.upsert
export const delete_ = mysqlQuery.delete
export const createTable = mysqlQuery.createTable
export const dropTable = mysqlQuery.dropTable
export const createIndex = mysqlQuery.createIndex
export const dropIndex = mysqlQuery.dropIndex
export const union = mysqlQuery.union
export const intersect = mysqlQuery.intersect
export const except = mysqlQuery.except
export const select = mysqlQuery.select
export const where = mysqlQuery.where
export const having = mysqlQuery.having
export const from = mysqlQuery.from
export const innerJoin = mysqlQuery.innerJoin
export const leftJoin = mysqlQuery.leftJoin
export const rightJoin = mysqlQuery.rightJoin
export const fullJoin = mysqlQuery.fullJoin
export const crossJoin = mysqlQuery.crossJoin
export const distinct = mysqlQuery.distinct
export const limit = mysqlQuery.limit
export const offset = mysqlQuery.offset
export const lock = mysqlQuery.lock
export const orderBy = mysqlQuery.orderBy
export const groupBy = mysqlQuery.groupBy
export { case_ as case }
export { in_ as in }
export { with_ as with }
export { delete_ as delete }

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
  MutationInputOf,
  MutationTargetLike,
  NumericExpressionInput,
  PredicateInput,
  QueryCapability,
  QueryPlan,
  QueryStatement,
  QueryRequirement,
  SetCompatiblePlan,
  SetCompatibleRightPlan,
  SetOperator,
  ResultRow,
  ResultRows,
  RuntimeResultRow,
  RuntimeResultRows,
  SchemaTableLike,
  SourceCapabilitiesOf,
  SourceRequiredOf,
  SourceRequirementError,
  StatementOfPlan,
  StringExpressionInput
}

export { union_query_capabilities } from "../query.ts"
