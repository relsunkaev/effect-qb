import * as Expression from "../internal/scalar.js"
import * as RowSet from "../internal/row-set.js"
import type {
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
} from "../internal/query.js"
import * as Dsl from "../postgres/internal/dsl.js"
import * as PgTemporal from "../postgres/function/temporal.js"
import { standardDatatypes } from "./datatypes/index.js"

type AnyFunction = (...args: readonly any[]) => any
type StandardFunction = (...args: readonly any[]) => any
type StandardQueryFactory = (...args: readonly any[]) => StandardPlan
type StandardPlan = QueryPlan<any, any, any, "standard", any, any, any, any, any, any, any, any>
const dsl = Dsl as unknown as Record<string, AnyFunction>
const temporal = PgTemporal as unknown as Record<string, AnyFunction>

const isObject = (value: unknown): value is Record<PropertyKey, any> =>
  value !== null && typeof value === "object"

const hasConcreteDialect = (value: unknown, seen = new WeakSet<object>()): boolean => {
  if (!isObject(value)) {
    return false
  }
  if (seen.has(value)) {
    return false
  }
  seen.add(value)
  const dialect = Expression.TypeId in value
    ? value[Expression.TypeId].dialect
    : RowSet.TypeId in value
      ? value[RowSet.TypeId].dialect
      : typeof value.dialect === "string"
        ? value.dialect
        : undefined
  if (dialect !== undefined && dialect !== "standard") {
    return true
  }
  for (const nested of Object.values(value)) {
    if (hasConcreteDialect(nested, seen)) {
      return true
    }
  }
  return false
}

const retagDbType = (dbType: unknown): unknown => {
  if (!isObject(dbType)) {
    return dbType
  }
  return {
    ...dbType,
    dialect: "standard",
    ...("base" in dbType ? { base: retagDbType(dbType.base) } : {}),
    ...("element" in dbType ? { element: retagDbType(dbType.element) } : {})
  }
}

const retagStandard = (value: unknown, seen = new WeakSet<object>()): unknown => {
  if (!isObject(value)) {
    return value
  }
  if (seen.has(value)) {
    return value
  }
  seen.add(value)
  if (Expression.TypeId in value) {
    value[Expression.TypeId] = {
      ...value[Expression.TypeId],
      dialect: "standard",
      dbType: retagDbType(value[Expression.TypeId].dbType)
    }
  }
  if (RowSet.TypeId in value) {
    value[RowSet.TypeId] = {
      ...value[RowSet.TypeId],
      dialect: "standard",
      selection: retagStandard(value[RowSet.TypeId].selection, seen)
    }
  }
  if (typeof value.dialect === "string") {
    value.dialect = "standard"
  }
  for (const nested of Object.values(value)) {
    retagStandard(nested, seen)
  }
  return value
}

const wrap = <FunctionValue extends AnyFunction>(
  fn: FunctionValue,
  concreteSeen = false
): FunctionValue =>
  ((...args: readonly unknown[]) => {
    const nextConcreteSeen = concreteSeen || args.some((arg) => hasConcreteDialect(arg))
    const result = fn(...args)
    return typeof result === "function"
      ? wrap(result as AnyFunction, nextConcreteSeen)
      : nextConcreteSeen
        ? result
        : retagStandard(result)
  }) as FunctionValue

const wrapName = (
  source: Record<string, AnyFunction>,
  name: string
): AnyFunction => {
  const fn = source[name]
  if (typeof fn !== "function") {
    throw new Error(`Missing standard query helper: ${name}`)
  }
  return wrap(fn)
}

export const literal = wrapName(dsl, "literal") as StandardFunction
export const column = wrapName(dsl, "column") as StandardFunction
export const cast = wrapName(dsl, "cast") as StandardFunction
export const eq = wrapName(dsl, "eq") as StandardFunction
export const neq = wrapName(dsl, "neq") as StandardFunction
export const lt = wrapName(dsl, "lt") as StandardFunction
export const lte = wrapName(dsl, "lte") as StandardFunction
export const gt = wrapName(dsl, "gt") as StandardFunction
export const gte = wrapName(dsl, "gte") as StandardFunction
export const isNull = wrapName(dsl, "isNull") as StandardFunction
export const isNotNull = wrapName(dsl, "isNotNull") as StandardFunction
export const like = wrapName(dsl, "like") as StandardFunction
export const ilike = wrapName(dsl, "ilike") as StandardFunction
export const collate = wrapName(dsl, "collate") as StandardFunction
export const regexMatch = wrapName(dsl, "regexMatch") as StandardFunction
export const regexIMatch = wrapName(dsl, "regexIMatch") as StandardFunction
export const regexNotMatch = wrapName(dsl, "regexNotMatch") as StandardFunction
export const regexNotIMatch = wrapName(dsl, "regexNotIMatch") as StandardFunction
export const and = wrapName(dsl, "and") as StandardFunction
export const or = wrapName(dsl, "or") as StandardFunction
export const not = wrapName(dsl, "not") as StandardFunction
export const all = wrapName(dsl, "all") as StandardFunction
export const any = wrapName(dsl, "any") as StandardFunction
export const case_ = wrapName(dsl, "case_") as StandardFunction
export const match = wrapName(dsl, "match") as StandardFunction
export const in_ = wrapName(dsl, "in_") as StandardFunction
export const notIn = wrapName(dsl, "notIn") as StandardFunction
export const between = wrapName(dsl, "between") as StandardFunction
export const contains = wrapName(dsl, "contains") as StandardFunction
export const containedBy = wrapName(dsl, "containedBy") as StandardFunction
export const overlaps = wrapName(dsl, "overlaps") as StandardFunction
export const exists = wrapName(dsl, "exists") as StandardFunction
export const isDistinctFrom = wrapName(dsl, "isDistinctFrom") as StandardFunction
export const isNotDistinctFrom = wrapName(dsl, "isNotDistinctFrom") as StandardFunction
export const excluded = wrapName(dsl, "excluded") as StandardFunction
export const as = wrapName(dsl, "as") as StandardFunction
export const with_ = wrapName(dsl, "with_") as StandardFunction
export const withRecursive = wrapName(dsl, "withRecursive") as StandardFunction
export const lateral = wrapName(dsl, "lateral") as StandardFunction
export const scalar = wrapName(dsl, "scalar") as StandardFunction
export const inSubquery = wrapName(dsl, "inSubquery") as StandardFunction
export const compareAny = wrapName(dsl, "compareAny") as StandardFunction
export const compareAll = wrapName(dsl, "compareAll") as StandardFunction
export const values = wrapName(dsl, "values") as StandardFunction
export const unnest = wrapName(dsl, "unnest") as StandardFunction
export const select = wrapName(dsl, "select") as StandardQueryFactory
export const returning = wrapName(dsl, "returning") as StandardFunction
export const onConflict = wrapName(dsl, "onConflict") as StandardFunction
export const insert = wrapName(dsl, "insert") as StandardQueryFactory
export const update = wrapName(dsl, "update") as StandardQueryFactory
export const upsert = wrapName(dsl, "upsert") as StandardQueryFactory
export const delete_ = wrapName(dsl, "delete_") as StandardQueryFactory
export const truncate = wrapName(dsl, "truncate") as StandardQueryFactory
export const merge = wrapName(dsl, "merge") as StandardFunction
export const transaction = wrapName(dsl, "transaction") as StandardFunction
export const commit = wrapName(dsl, "commit") as StandardFunction
export const rollback = wrapName(dsl, "rollback") as StandardFunction
export const savepoint = wrapName(dsl, "savepoint") as StandardFunction
export const rollbackTo = wrapName(dsl, "rollbackTo") as StandardFunction
export const releaseSavepoint = wrapName(dsl, "releaseSavepoint") as StandardFunction
export const createTable = wrapName(dsl, "createTable") as StandardQueryFactory
export const dropTable = wrapName(dsl, "dropTable") as StandardQueryFactory
export const createIndex = wrapName(dsl, "createIndex") as StandardQueryFactory
export const dropIndex = wrapName(dsl, "dropIndex") as StandardQueryFactory
export const union = wrapName(dsl, "union") as StandardFunction
export const unionAll = wrapName(dsl, "unionAll") as StandardFunction
export const intersect = wrapName(dsl, "intersect") as StandardFunction
export const intersectAll = wrapName(dsl, "intersectAll") as StandardFunction
export const except = wrapName(dsl, "except") as StandardFunction
export const exceptAll = wrapName(dsl, "exceptAll") as StandardFunction
export const where = wrapName(dsl, "where") as StandardFunction
export const having = wrapName(dsl, "having") as StandardFunction
export const from = wrapName(dsl, "from") as StandardFunction
export const innerJoin = wrapName(dsl, "innerJoin") as StandardFunction
export const leftJoin = wrapName(dsl, "leftJoin") as StandardFunction
export const rightJoin = wrapName(dsl, "rightJoin") as StandardFunction
export const fullJoin = wrapName(dsl, "fullJoin") as StandardFunction
export const crossJoin = wrapName(dsl, "crossJoin") as StandardFunction
export const distinct = wrapName(dsl, "distinct") as StandardFunction
export const limit = wrapName(dsl, "limit") as StandardFunction
export const offset = wrapName(dsl, "offset") as StandardFunction
export const lock = wrapName(dsl, "lock") as StandardFunction
export const orderBy = wrapName(dsl, "orderBy") as StandardFunction
export const groupBy = wrapName(dsl, "groupBy") as StandardFunction
export const lower = wrapName(dsl, "lower") as StandardFunction
export const upper = wrapName(dsl, "upper") as StandardFunction
export const concat = wrapName(dsl, "concat") as StandardFunction
export const coalesce = wrapName(dsl, "coalesce") as StandardFunction
export const call = wrapName(dsl, "call") as StandardFunction
export const count = wrapName(dsl, "count") as StandardFunction
export const max = wrapName(dsl, "max") as StandardFunction
export const min = wrapName(dsl, "min") as StandardFunction
export const over = wrapName(dsl, "over") as StandardFunction
export const rowNumber = wrapName(dsl, "rowNumber") as StandardFunction
export const rank = wrapName(dsl, "rank") as StandardFunction
export const denseRank = wrapName(dsl, "denseRank") as StandardFunction
export const currentDate = wrapName(temporal, "currentDate") as StandardFunction
export const currentTime = wrapName(temporal, "currentTime") as StandardFunction
export const currentTimestamp = wrapName(temporal, "currentTimestamp") as StandardFunction
export const localTime = wrapName(temporal, "localTime") as StandardFunction
export const localTimestamp = wrapName(temporal, "localTimestamp") as StandardFunction
export const now = wrapName(temporal, "now") as StandardFunction

const standardType = standardDatatypes
export { case_ as case, in_ as in, standardType as type }
export { union_query_capabilities } from "../internal/query.js"

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
}
