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
import { mysqlDsl } from "./internal/dsl.js"

export const literal = mysqlDsl.literal
export const column = mysqlDsl.column
export const cast = mysqlDsl.cast
export const type = mysqlDsl.type
export const eq = mysqlDsl.eq
export const neq = mysqlDsl.neq
export const lt = mysqlDsl.lt
export const lte = mysqlDsl.lte
export const gt = mysqlDsl.gt
export const gte = mysqlDsl.gte
export const isNull = mysqlDsl.isNull
export const isNotNull = mysqlDsl.isNotNull
export const like = mysqlDsl.like
export const ilike = mysqlDsl.ilike
export const regexMatch = mysqlDsl.regexMatch
export const regexIMatch = mysqlDsl.regexIMatch
export const regexNotMatch = mysqlDsl.regexNotMatch
export const regexNotIMatch = mysqlDsl.regexNotIMatch
export const and = mysqlDsl.and
export const or = mysqlDsl.or
export const not = mysqlDsl.not
export const all = mysqlDsl.all
export const any = mysqlDsl.any
const case_ = mysqlDsl.case
export const match = mysqlDsl.match
export const in_ = mysqlDsl.in
export const notIn = mysqlDsl.notIn
export const between = mysqlDsl.between
export const contains = mysqlDsl.contains
export const containedBy = mysqlDsl.containedBy
export const overlaps = mysqlDsl.overlaps
export const exists = mysqlDsl.exists
export const isDistinctFrom = mysqlDsl.isDistinctFrom
export const isNotDistinctFrom = mysqlDsl.isNotDistinctFrom
export const excluded = mysqlDsl.excluded
export const as = mysqlDsl.as
export const with_ = mysqlDsl.with
export const withRecursive = mysqlDsl.withRecursive
export const lateral = mysqlDsl.lateral
export const scalar = mysqlDsl.scalar
export const inSubquery = mysqlDsl.inSubquery
export const compareAny = mysqlDsl.compareAny
export const compareAll = mysqlDsl.compareAll
export const values = mysqlDsl.values
export const unnest = mysqlDsl.unnest
export const generateSeries = mysqlDsl.generateSeries
export const returning = mysqlDsl.returning
export const onConflict = mysqlDsl.onConflict
export const insert = mysqlDsl.insert
export const update = mysqlDsl.update
export const upsert = mysqlDsl.upsert
export const delete_ = mysqlDsl.delete
export const truncate = mysqlDsl.truncate
export const merge = mysqlDsl.merge
export const transaction = mysqlDsl.transaction
export const commit = mysqlDsl.commit
export const rollback = mysqlDsl.rollback
export const savepoint = mysqlDsl.savepoint
export const rollbackTo = mysqlDsl.rollbackTo
export const releaseSavepoint = mysqlDsl.releaseSavepoint
export const createTable = mysqlDsl.createTable
export const dropTable = mysqlDsl.dropTable
export const createIndex = mysqlDsl.createIndex
export const dropIndex = mysqlDsl.dropIndex
export const union = mysqlDsl.union
export const unionAll = mysqlDsl.unionAll
export const intersect = mysqlDsl.intersect
export const intersectAll = mysqlDsl.intersectAll
export const except = mysqlDsl.except
export const exceptAll = mysqlDsl.exceptAll
export const select = mysqlDsl.select
export const where = mysqlDsl.where
export const having = mysqlDsl.having
export const from = mysqlDsl.from
export const innerJoin = mysqlDsl.innerJoin
export const leftJoin = mysqlDsl.leftJoin
export const rightJoin = mysqlDsl.rightJoin
export const fullJoin = mysqlDsl.fullJoin
export const crossJoin = mysqlDsl.crossJoin
export const distinct = mysqlDsl.distinct
export const distinctOn = mysqlDsl.distinctOn
export const limit = mysqlDsl.limit
export const offset = mysqlDsl.offset
export const lock = mysqlDsl.lock
export const orderBy = mysqlDsl.orderBy
export const groupBy = mysqlDsl.groupBy
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
