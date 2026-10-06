import type * as Expression from "../internal/scalar.js"

export {
  // Read queries
  select,
  from,
  innerJoin,
  leftJoin,
  rightJoin,
  fullJoin,
  crossJoin,
  where,
  groupBy,
  having,
  orderBy,
  limit,
  offset,
  distinct,
  lock,

  // Sources and subqueries
  values,
  unnest,
  as,
  with_ as with,
  withRecursive,
  lateral,
  scalar,
  exists,
  inSubquery,
  compareAny,
  compareAll,

  // Set operations
  union,
  unionAll,
  intersect,
  intersectAll,
  except,
  exceptAll,

  // Mutations
  insert,
  update,
  upsert,
  delete_ as delete,
  merge,
  onConflict,
  excluded,
  returning,

  // Expressions and predicates
  literal,
  column,
  cast,
  eq,
  neq,
  lt,
  lte,
  gt,
  gte,
  isNull,
  isNotNull,
  isDistinctFrom,
  isNotDistinctFrom,
  like,
  ilike,
  collate,
  regexMatch,
  regexIMatch,
  regexNotMatch,
  regexNotIMatch,
  and,
  or,
  not,
  all,
  any,
  case_ as case,
  match,
  in_ as in,
  notIn,
  between,
  contains,
  containedBy,
  overlaps,
  concat,
  coalesce,

  // Aggregates and windows
  count,
  max,
  min,
  over,
  rowNumber,
  rank,
  denseRank,

  // Transactions
  transaction,
  commit,
  rollback,
  savepoint,
  rollbackTo,
  releaseSavepoint,

  // Schema changes
  createTable,
  dropTable,
  createIndex,
  dropIndex,
  truncate
} from "./internal/dsl.js"

export {
  abs,
  add,
  multiply,
  negate,
  subtract
} from "../internal/numeric.js"

export { andAll, includeIf, orAll, when } from "../internal/dynamic.js"
export {
  firstValue,
  lag,
  lastValue,
  lead,
  type OffsetOptions,
  type WindowOrderSpec,
  type WindowOrderTerm
} from "../internal/analytics.js"

export { union_query_capabilities } from "../internal/query/plan.js"

export type MutationInputOf<Shape> = {
  readonly [K in keyof Shape]:
    | Shape[K]
    | Expression.Scalar<Shape[K], Expression.DbType.Any, Expression.Nullability, "standard", Expression.ScalarKind, Expression.BindingId>
}

export type {
  AnyTableFunctionSource,
  AnyUnnestSource,
  AnyValuesSource,
  CapabilitiesOfPlan,
  CompletePlan,
  CteSource,
  DialectCompatiblePlan,
  DerivedSourceRequiredError,
  EffectiveNullability,
  ExpressionInput,
  ExpressionOutput,
  GroupByInput,
  HavingPredicateInput,
  MergeCapabilities,
  MergeCapabilityTuple,
  MutationTargetLike,
  NumericExpressionInput,
  OrderDirection,
  OutputOfSelection,
  PredicateInput,
  QueryCapability,
  QueryPlan,
  QueryRequirement,
  QueryStatement,
  ResultRow,
  ResultRows,
  RuntimeResultRow,
  RuntimeResultRows,
  SchemaTableLike,
  SetCompatiblePlan,
  SetCompatibleRightPlan,
  SetOperator,
  SourceCapabilitiesOf,
  SourceRequiredOf,
  SourceRequirementError,
  StatementOfPlan,
  StringExpressionInput
} from "../internal/query/plan.js"
