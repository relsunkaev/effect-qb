import { postgresDsl } from "./internal/dsl.js"
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
} from "../internal/query.js"

export const literal = postgresDsl.literal
export const column = postgresDsl.column
export const eq = postgresDsl.eq
export const neq = postgresDsl.neq
export const lt = postgresDsl.lt
export const lte = postgresDsl.lte
export const gt = postgresDsl.gt
export const gte = postgresDsl.gte
export const isNull = postgresDsl.isNull
export const isNotNull = postgresDsl.isNotNull
export const like = postgresDsl.like
export const ilike = postgresDsl.ilike
export const regexMatch = postgresDsl.regexMatch
export const regexIMatch = postgresDsl.regexIMatch
export const regexNotMatch = postgresDsl.regexNotMatch
export const regexNotIMatch = postgresDsl.regexNotIMatch
export const and = postgresDsl.and
export const or = postgresDsl.or
export const not = postgresDsl.not
export const all = postgresDsl.all
export const any = postgresDsl.any
const case_ = postgresDsl.case
export const match = postgresDsl.match
export const in_ = postgresDsl.in
export const notIn = postgresDsl.notIn
export const between = postgresDsl.between
export const contains = postgresDsl.contains
export const containedBy = postgresDsl.containedBy
export const overlaps = postgresDsl.overlaps
export const exists = postgresDsl.exists
export const isDistinctFrom = postgresDsl.isDistinctFrom
export const isNotDistinctFrom = postgresDsl.isNotDistinctFrom
export const excluded = postgresDsl.excluded
export const as = postgresDsl.as
export const with_ = postgresDsl.with
export const withRecursive = postgresDsl.withRecursive
export const lateral = postgresDsl.lateral
export const scalar = postgresDsl.scalar
export const inSubquery = postgresDsl.inSubquery
export const compareAny = postgresDsl.compareAny
export const compareAll = postgresDsl.compareAll
export const values = postgresDsl.values
export const unnest = postgresDsl.unnest
export const generateSeries = postgresDsl.generateSeries
export const returning = postgresDsl.returning
export const onConflict = postgresDsl.onConflict
export const insert = postgresDsl.insert
export const update = postgresDsl.update
export const upsert = postgresDsl.upsert
export const delete_ = postgresDsl.delete
export const truncate = postgresDsl.truncate
export const merge = postgresDsl.merge
export const transaction = postgresDsl.transaction
export const commit = postgresDsl.commit
export const rollback = postgresDsl.rollback
export const savepoint = postgresDsl.savepoint
export const rollbackTo = postgresDsl.rollbackTo
export const releaseSavepoint = postgresDsl.releaseSavepoint
export const createTable = postgresDsl.createTable
export const dropTable = postgresDsl.dropTable
export const createIndex = postgresDsl.createIndex
export const dropIndex = postgresDsl.dropIndex
export const union = postgresDsl.union
export const unionAll = postgresDsl.unionAll
export const intersect = postgresDsl.intersect
export const intersectAll = postgresDsl.intersectAll
export const except = postgresDsl.except
export const exceptAll = postgresDsl.exceptAll
export const select = postgresDsl.select
export const where = postgresDsl.where
export const having = postgresDsl.having
export const from = postgresDsl.from
export const innerJoin = postgresDsl.innerJoin
export const leftJoin = postgresDsl.leftJoin
export const rightJoin = postgresDsl.rightJoin
export const fullJoin = postgresDsl.fullJoin
export const crossJoin = postgresDsl.crossJoin
export const distinct = postgresDsl.distinct
export const distinctOn = postgresDsl.distinctOn
export const limit = postgresDsl.limit
export const offset = postgresDsl.offset
export const lock = postgresDsl.lock
export const orderBy = postgresDsl.orderBy
export const groupBy = postgresDsl.groupBy
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

export { union_query_capabilities } from "../internal/query.js"
