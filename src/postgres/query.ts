import * as Expression from "../internal/expression.ts"
import { postgresDatatypes } from "./datatypes/index.ts"
import {
  type CapabilitiesOfPlan,
  type CompletePlan,
  type DialectCompatiblePlan,
  type DerivedSourceRequiredError,
  type CteSource,
  type EffectiveNullability,
  type ExpressionInput,
  type ExpressionOutput,
  type GroupByInput,
  type MergeCapabilities,
  type MergeCapabilityTuple,
  type HavingPredicateInput,
  type OrderDirection,
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
} from "../internal/query.ts"
import { makeDialectQuery } from "../internal/query-factory.ts"

const postgresQuery = makeDialectQuery({
  dialect: "postgres",
  textDb: { dialect: "postgres", kind: "text" } as Expression.DbType.PgText,
  numericDb: { dialect: "postgres", kind: "float8" } as Expression.DbType.PgFloat8,
  boolDb: { dialect: "postgres", kind: "bool" } as Expression.DbType.PgBool,
  timestampDb: { dialect: "postgres", kind: "timestamp" } as Expression.DbType.PgTimestamp,
  nullDb: { dialect: "postgres", kind: "null" } as Expression.DbType.Base<"postgres", "null">,
  type: postgresDatatypes
})

export const literal = postgresQuery.literal
export const cast = postgresQuery.cast
export const type = postgresQuery.type
export const json = postgresQuery.json
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
export const all = postgresQuery.all
export const any = postgresQuery.any
const case_ = postgresQuery.case
export const match = postgresQuery.match
export const coalesce = postgresQuery.coalesce
export const in_ = postgresQuery.in
export const notIn = postgresQuery.notIn
export const between = postgresQuery.between
export const contains = postgresQuery.contains
export const containedBy = postgresQuery.containedBy
export const overlaps = postgresQuery.overlaps
export const concat = postgresQuery.concat
export const exists = postgresQuery.exists
export const over = postgresQuery.over
export const rowNumber = postgresQuery.rowNumber
export const rank = postgresQuery.rank
export const denseRank = postgresQuery.denseRank
export const count = postgresQuery.count
export const max = postgresQuery.max
export const min = postgresQuery.min
export const isDistinctFrom = postgresQuery.isDistinctFrom
export const isNotDistinctFrom = postgresQuery.isNotDistinctFrom
export const excluded = postgresQuery.excluded
export const as = postgresQuery.as
export const with_ = postgresQuery.with
export const withRecursive = postgresQuery.withRecursive
export const lateral = postgresQuery.lateral
export const scalar = postgresQuery.scalar
export const inSubquery = postgresQuery.inSubquery
export const compareAny = postgresQuery.compareAny
export const compareAll = postgresQuery.compareAll
export const values = postgresQuery.values
export const unnest = postgresQuery.unnest
export const generateSeries = postgresQuery.generateSeries
export const returning = postgresQuery.returning
export const defaultValues = postgresQuery.defaultValues
export const onConflict = postgresQuery.onConflict
export const insert = postgresQuery.insert
export const update = postgresQuery.update
export const upsert = postgresQuery.upsert
export const delete_ = postgresQuery.delete
export const truncate = postgresQuery.truncate
export const merge = postgresQuery.merge
export const transaction = postgresQuery.transaction
export const commit = postgresQuery.commit
export const rollback = postgresQuery.rollback
export const savepoint = postgresQuery.savepoint
export const rollbackTo = postgresQuery.rollbackTo
export const releaseSavepoint = postgresQuery.releaseSavepoint
export const createTable = postgresQuery.createTable
export const dropTable = postgresQuery.dropTable
export const createIndex = postgresQuery.createIndex
export const dropIndex = postgresQuery.dropIndex
export const union = postgresQuery.union
export const unionAll = postgresQuery.unionAll
export const intersect = postgresQuery.intersect
export const intersectAll = postgresQuery.intersectAll
export const except = postgresQuery.except
export const exceptAll = postgresQuery.exceptAll
export const select = postgresQuery.select
export const where = postgresQuery.where
export const having = postgresQuery.having
export const from = postgresQuery.from
export const innerJoin = postgresQuery.innerJoin
export const leftJoin = postgresQuery.leftJoin
export const rightJoin = postgresQuery.rightJoin
export const fullJoin = postgresQuery.fullJoin
export const crossJoin = postgresQuery.crossJoin
export const distinct = postgresQuery.distinct
export const distinctOn = postgresQuery.distinctOn
export const limit = postgresQuery.limit
export const offset = postgresQuery.offset
export const lock = postgresQuery.lock
export const orderBy = postgresQuery.orderBy
export const groupBy = postgresQuery.groupBy
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
  ExpressionOutput,
  GroupByInput,
  MergeCapabilities,
  MergeCapabilityTuple,
  HavingPredicateInput,
  OrderDirection,
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

export { union_query_capabilities } from "../internal/query.ts"
