import * as Query from "../query.ts"
import * as Expression from "../expression.ts"
import * as Table from "../table.ts"
import * as QueryAst from "./query-ast.ts"
import type { RenderState, SqlDialect } from "./dialect.ts"
import * as ExpressionAst from "./expression-ast.ts"
import { flattenSelection, type Projection } from "./projections.ts"
import { type SelectionValue, validateAggregationSelection } from "./aggregation-validation.ts"

const renderDbType = (
  dialect: SqlDialect,
  dbType: Expression.DbType.Any
): string => {
  if (dialect.name === "mysql" && dbType.dialect === "mysql" && dbType.kind === "uuid") {
    return "char(36)"
  }
  return dbType.kind
}

const renderCastType = (
  dialect: SqlDialect,
  dbType: Expression.DbType.Any
): string => {
  if (dialect.name !== "mysql") {
    return dbType.kind
  }
  switch (dbType.kind) {
    case "text":
      return "char"
    case "uuid":
      return "char(36)"
    case "numeric":
      return "decimal"
    case "timestamp":
      return "datetime"
    case "bool":
    case "boolean":
      return "boolean"
    case "json":
      return "json"
    default:
      return dbType.kind
  }
}

const renderColumnDefinition = (
  dialect: SqlDialect,
  columnName: string,
  column: Table.AnyTable[typeof Table.TypeId]["fields"][string]
): string => {
  const clauses = [
    dialect.quoteIdentifier(columnName),
    renderDbType(dialect, column.metadata.dbType)
  ]
  if (!column.metadata.nullable) {
    clauses.push("not null")
  }
  return clauses.join(" ")
}

const renderCheckPredicate = (
  predicate: unknown,
  state: RenderState,
  dialect: SqlDialect
): string => {
  if (typeof predicate === "string") {
    return predicate
  }
  if (predicate !== null && typeof predicate === "object" && Expression.TypeId in predicate) {
    return renderExpression(predicate as Expression.Any, state, dialect)
  }
  throw new Error("Unsupported check constraint predicate for DDL rendering")
}

const renderCreateTableSql = (
  targetSource: QueryAst.FromClause,
  state: RenderState,
  dialect: SqlDialect,
  ifNotExists: boolean
): string => {
  const table = targetSource.source as Table.AnyTable
  const fields = table[Table.TypeId].fields
  const definitions = Object.entries(fields).map(([columnName, column]) =>
    renderColumnDefinition(dialect, columnName, column)
  )
  for (const option of table[Table.OptionsSymbol]) {
    switch (option.kind) {
      case "primaryKey":
        definitions.push(`primary key (${option.columns.map((column) => dialect.quoteIdentifier(column)).join(", ")})`)
        break
      case "unique":
        definitions.push(`unique (${option.columns.map((column) => dialect.quoteIdentifier(column)).join(", ")})`)
        break
      case "foreignKey": {
        const reference = option.references()
        definitions.push(
          `foreign key (${option.columns.map((column) => dialect.quoteIdentifier(column)).join(", ")}) references ${dialect.quoteIdentifier(reference.tableName)} (${reference.columns.map((column) => dialect.quoteIdentifier(column)).join(", ")})`
        )
        break
      }
      case "check":
        definitions.push(
          `constraint ${dialect.quoteIdentifier(option.name)} check (${renderCheckPredicate(option.predicate, state, dialect)})`
        )
        break
      case "index":
        break
    }
  }
  return `create table${ifNotExists ? " if not exists" : ""} ${dialect.quoteIdentifier(targetSource.baseTableName)} (${definitions.join(", ")})`
}

const renderCreateIndexSql = (
  targetSource: QueryAst.FromClause,
  ddl: Extract<QueryAst.DdlClause, { readonly kind: "createIndex" }>,
  dialect: SqlDialect
): string => {
  const maybeIfNotExists = dialect.name === "postgres" && ddl.ifNotExists ? " if not exists" : ""
  return `create${ddl.unique ? " unique" : ""} index${maybeIfNotExists} ${dialect.quoteIdentifier(ddl.name)} on ${dialect.quoteIdentifier(targetSource.baseTableName)} (${ddl.columns.map((column) => dialect.quoteIdentifier(column)).join(", ")})`
}

const renderDropIndexSql = (
  targetSource: QueryAst.FromClause,
  ddl: Extract<QueryAst.DdlClause, { readonly kind: "dropIndex" }>,
  dialect: SqlDialect
): string =>
  dialect.name === "postgres"
    ? `drop index${ddl.ifExists ? " if exists" : ""} ${dialect.quoteIdentifier(ddl.name)}`
    : `drop index ${dialect.quoteIdentifier(ddl.name)} on ${dialect.quoteIdentifier(targetSource.baseTableName)}`

export interface RenderedQueryAst {
  readonly sql: string
  readonly projections: readonly Projection[]
}

const selectionProjections = (selection: Record<string, unknown>): readonly Projection[] =>
  flattenSelection(selection).map(({ path, alias }) => ({
    path,
    alias
  }))

const renderSelectionList = (
  selection: Record<string, unknown>,
  state: RenderState,
  dialect: SqlDialect,
  validateAggregation: boolean
): RenderedQueryAst => {
  if (validateAggregation) {
    validateAggregationSelection(selection as SelectionValue, [])
  }
  const flattened = flattenSelection(selection)
  const projections = selectionProjections(selection)
  const sql = flattened.map(({ expression, alias }) =>
    `${renderExpression(expression, state, dialect)} as ${dialect.quoteIdentifier(alias)}`).join(", ")
  return {
    sql,
    projections
  }
}

export const renderQueryAst = (
  ast: QueryAst.Ast<Record<string, unknown>, any, QueryAst.QueryStatement>,
  state: RenderState,
  dialect: SqlDialect
): RenderedQueryAst => {
  let sql = ""
  let projections: readonly Projection[] = []

  switch (ast.kind) {
    case "select": {
      validateAggregationSelection(ast.select as SelectionValue, ast.groupBy)
      const rendered = renderSelectionList(ast.select as Record<string, unknown>, state, dialect, false)
      projections = rendered.projections
      const clauses = [`select${ast.distinct ? " distinct" : ""} ${rendered.sql}`]
      if (ast.from) {
        clauses.push(`from ${renderSourceReference(ast.from.source, ast.from.tableName, ast.from.baseTableName, state, dialect)}`)
      }
      for (const join of ast.joins) {
        const source = renderSourceReference(join.source, join.tableName, join.baseTableName, state, dialect)
        clauses.push(
          join.kind === "cross"
            ? `cross join ${source}`
            : `${join.kind} join ${source} on ${renderExpression(join.on!, state, dialect)}`
        )
      }
      if (ast.where.length > 0) {
        clauses.push(`where ${ast.where.map((entry: QueryAst.WhereClause) => renderExpression(entry.predicate, state, dialect)).join(" and ")}`)
      }
      if (ast.groupBy.length > 0) {
        clauses.push(`group by ${ast.groupBy.map((value: QueryAst.Ast["groupBy"][number]) => renderExpression(value, state, dialect)).join(", ")}`)
      }
      if (ast.having.length > 0) {
        clauses.push(`having ${ast.having.map((entry: QueryAst.HavingClause) => renderExpression(entry.predicate, state, dialect)).join(" and ")}`)
      }
      if (ast.orderBy.length > 0) {
        clauses.push(`order by ${ast.orderBy.map((entry: QueryAst.OrderByClause) => `${renderExpression(entry.value, state, dialect)} ${entry.direction}`).join(", ")}`)
      }
      if (ast.limit) {
        clauses.push(`limit ${renderExpression(ast.limit, state, dialect)}`)
      }
      if (ast.offset) {
        clauses.push(`offset ${renderExpression(ast.offset, state, dialect)}`)
      }
      if (ast.lock) {
        clauses.push(
          `${ast.lock.mode === "update" ? "for update" : "for share"}${ast.lock.nowait ? " nowait" : ""}${ast.lock.skipLocked ? " skip locked" : ""}`
        )
      }
      sql = clauses.join(" ")
      break
    }
    case "set": {
      const setAst = ast as QueryAst.Ast<Record<string, unknown>, any, "set">
      const base = renderQueryAst(
        Query.getAst(setAst.setBase as Query.QueryPlan<any, any, any, any, any, any, any, any, any, any>) as QueryAst.Ast<
          Record<string, unknown>,
          any,
          QueryAst.QueryStatement
        >,
        state,
        dialect
      )
      projections = selectionProjections(setAst.select as Record<string, unknown>)
      sql = [
        `(${base.sql})`,
        ...(setAst.setOperations ?? []).map((entry) => {
          const rendered = renderQueryAst(
            Query.getAst(entry.query as Query.QueryPlan<any, any, any, any, any, any, any, any, any, any>) as QueryAst.Ast<
              Record<string, unknown>,
              any,
              QueryAst.QueryStatement
            >,
            state,
            dialect
          )
          return `${entry.kind} (${rendered.sql})`
        })
      ].join(" ")
      break
    }
    case "insert": {
      const insertAst = ast as QueryAst.Ast<Record<string, unknown>, any, "insert">
      const targetSource = insertAst.into!
      const target = renderSourceReference(targetSource.source, targetSource.tableName, targetSource.baseTableName, state, dialect)
      const columns = insertAst.values!.map((entry) => dialect.quoteIdentifier(entry.columnName)).join(", ")
      const values = insertAst.values!.map((entry) => renderExpression(entry.value, state, dialect)).join(", ")
      sql = `insert into ${target}`
      if (insertAst.values!.length > 0) {
        sql += ` (${columns}) values (${values})`
      } else {
        sql += " default values"
      }
      if (insertAst.conflict) {
        const updateValues = (insertAst.conflict.values ?? []).map((entry) =>
          `${dialect.quoteIdentifier(entry.columnName)} = ${renderExpression(entry.value, state, dialect)}`
        ).join(", ")
        if (dialect.name === "postgres") {
          sql += ` on conflict (${insertAst.conflict.columns.map((column) => dialect.quoteIdentifier(column)).join(", ")})`
          sql += insertAst.conflict.action === "doNothing"
            ? " do nothing"
            : ` do update set ${updateValues}`
        } else if (insertAst.conflict.action === "doNothing") {
          sql = sql.replace(/^insert/, "insert ignore")
        } else {
          sql += ` on duplicate key update ${updateValues}`
        }
      }
      const returning = renderSelectionList(insertAst.select as Record<string, unknown>, state, dialect, false)
      projections = returning.projections
      if (returning.sql.length > 0) {
        sql += ` returning ${returning.sql}`
      }
      break
    }
    case "update": {
      const updateAst = ast as QueryAst.Ast<Record<string, unknown>, any, "update">
      const targetSource = updateAst.target!
      const target = renderSourceReference(targetSource.source, targetSource.tableName, targetSource.baseTableName, state, dialect)
      const assignments = updateAst.set!.map((entry) =>
        `${dialect.quoteIdentifier(entry.columnName)} = ${renderExpression(entry.value, state, dialect)}`).join(", ")
      sql = `update ${target} set ${assignments}`
      if (updateAst.where.length > 0) {
        sql += ` where ${updateAst.where.map((entry: QueryAst.WhereClause) => renderExpression(entry.predicate, state, dialect)).join(" and ")}`
      }
      const returning = renderSelectionList(updateAst.select as Record<string, unknown>, state, dialect, false)
      projections = returning.projections
      if (returning.sql.length > 0) {
        sql += ` returning ${returning.sql}`
      }
      break
    }
    case "delete": {
      const deleteAst = ast as QueryAst.Ast<Record<string, unknown>, any, "delete">
      const targetSource = deleteAst.target!
      const target = renderSourceReference(targetSource.source, targetSource.tableName, targetSource.baseTableName, state, dialect)
      sql = `delete from ${target}`
      if (deleteAst.where.length > 0) {
        sql += ` where ${deleteAst.where.map((entry: QueryAst.WhereClause) => renderExpression(entry.predicate, state, dialect)).join(" and ")}`
      }
      const returning = renderSelectionList(deleteAst.select as Record<string, unknown>, state, dialect, false)
      projections = returning.projections
      if (returning.sql.length > 0) {
        sql += ` returning ${returning.sql}`
      }
      break
    }
    case "createTable": {
      const createTableAst = ast as QueryAst.Ast<Record<string, unknown>, any, "createTable">
      sql = renderCreateTableSql(createTableAst.target!, state, dialect, createTableAst.ddl?.kind === "createTable" && createTableAst.ddl.ifNotExists)
      break
    }
    case "dropTable": {
      const dropTableAst = ast as QueryAst.Ast<Record<string, unknown>, any, "dropTable">
      const ifExists = dropTableAst.ddl?.kind === "dropTable" && dropTableAst.ddl.ifExists
      sql = `drop table${ifExists ? " if exists" : ""} ${dialect.quoteIdentifier(dropTableAst.target!.baseTableName)}`
      break
    }
    case "createIndex": {
      const createIndexAst = ast as QueryAst.Ast<Record<string, unknown>, any, "createIndex">
      sql = renderCreateIndexSql(
        createIndexAst.target!,
        createIndexAst.ddl as Extract<QueryAst.DdlClause, { readonly kind: "createIndex" }>,
        dialect
      )
      break
    }
    case "dropIndex": {
      const dropIndexAst = ast as QueryAst.Ast<Record<string, unknown>, any, "dropIndex">
      sql = renderDropIndexSql(
        dropIndexAst.target!,
        dropIndexAst.ddl as Extract<QueryAst.DdlClause, { readonly kind: "dropIndex" }>,
        dialect
      )
      break
    }
  }

  if (state.ctes.length === 0) {
    return {
      sql,
      projections
    }
  }
  return {
    sql: `with${state.ctes.some((entry) => entry.recursive) ? " recursive" : ""} ${state.ctes.map((entry) => `${dialect.quoteIdentifier(entry.name)} as (${entry.sql})`).join(", ")} ${sql}`,
    projections
  }
}

const renderSourceReference = (
  source: unknown,
  tableName: string,
  baseTableName: string,
  state: RenderState,
  dialect: SqlDialect
): string => {
  if (typeof source === "object" && source !== null && "kind" in source && (source as { readonly kind?: string }).kind === "cte") {
    const cte = source as unknown as {
      readonly name: string
      readonly plan: Query.QueryPlan<any, any, any, any, any, any, any, any, any>
      readonly recursive?: boolean
    }
    if (!state.cteNames.has(cte.name)) {
      state.cteNames.add(cte.name)
      const rendered = renderQueryAst(Query.getAst(cte.plan) as QueryAst.Ast<Record<string, unknown>, any, QueryAst.QueryStatement>, state, dialect)
      state.ctes.push({
        name: cte.name,
        sql: rendered.sql,
        recursive: cte.recursive
      })
    }
    return dialect.quoteIdentifier(cte.name)
  }
  if (typeof source === "object" && source !== null && "kind" in source && (source as { readonly kind?: string }).kind === "derived") {
    const derived = source as unknown as {
      readonly name: string
      readonly plan: Query.QueryPlan<any, any, any, any, any, any, any, any, any>
    }
    if (!state.cteNames.has(derived.name)) {
      // derived tables are inlined, so no CTE registration is needed
    }
    return `(${renderQueryAst(Query.getAst(derived.plan) as QueryAst.Ast<Record<string, unknown>, any, QueryAst.QueryStatement>, state, dialect).sql}) as ${dialect.quoteIdentifier(derived.name)}`
  }
  if (typeof source === "object" && source !== null && "kind" in source && (source as { readonly kind?: string }).kind === "lateral") {
    const lateral = source as unknown as {
      readonly name: string
      readonly plan: Query.QueryPlan<any, any, any, any, any, any, any, any, any>
    }
    return `lateral (${renderQueryAst(Query.getAst(lateral.plan) as QueryAst.Ast<Record<string, unknown>, any, QueryAst.QueryStatement>, state, dialect).sql}) as ${dialect.quoteIdentifier(lateral.name)}`
  }
  return dialect.renderTableReference(tableName, baseTableName)
}

/**
 * Renders a scalar expression AST into SQL text.
 *
 * This is parameterized by a runtime dialect so the same expression walker can
 * be reused across dialect-specific renderers while still delegating quoting
 * and literal serialization to the concrete dialect implementation.
 */
export const renderExpression = (
  expression: Expression.Any,
  state: RenderState,
  dialect: SqlDialect
): string => {
  const ast = (expression as Expression.Any & {
    readonly [ExpressionAst.TypeId]: ExpressionAst.Any
  })[ExpressionAst.TypeId]
  switch (ast.kind) {
    case "column":
      return `${dialect.quoteIdentifier(ast.tableName)}.${dialect.quoteIdentifier(ast.columnName)}`
    case "literal":
      return dialect.renderLiteral(ast.value, state)
    case "cast":
      return `cast(${renderExpression(ast.value, state, dialect)} as ${renderCastType(dialect, ast.target)})`
    case "eq":
      return `(${renderExpression(ast.left, state, dialect)} = ${renderExpression(ast.right, state, dialect)})`
    case "neq":
      return `(${renderExpression(ast.left, state, dialect)} <> ${renderExpression(ast.right, state, dialect)})`
    case "lt":
      return `(${renderExpression(ast.left, state, dialect)} < ${renderExpression(ast.right, state, dialect)})`
    case "lte":
      return `(${renderExpression(ast.left, state, dialect)} <= ${renderExpression(ast.right, state, dialect)})`
    case "gt":
      return `(${renderExpression(ast.left, state, dialect)} > ${renderExpression(ast.right, state, dialect)})`
    case "gte":
      return `(${renderExpression(ast.left, state, dialect)} >= ${renderExpression(ast.right, state, dialect)})`
    case "like":
      return `(${renderExpression(ast.left, state, dialect)} like ${renderExpression(ast.right, state, dialect)})`
    case "ilike":
      return dialect.name === "postgres"
        ? `(${renderExpression(ast.left, state, dialect)} ilike ${renderExpression(ast.right, state, dialect)})`
        : `(lower(${renderExpression(ast.left, state, dialect)}) like lower(${renderExpression(ast.right, state, dialect)}))`
    case "isDistinctFrom":
      return dialect.name === "mysql"
        ? `(not (${renderExpression(ast.left, state, dialect)} <=> ${renderExpression(ast.right, state, dialect)}))`
        : `(${renderExpression(ast.left, state, dialect)} is distinct from ${renderExpression(ast.right, state, dialect)})`
    case "isNotDistinctFrom":
      return dialect.name === "mysql"
        ? `(${renderExpression(ast.left, state, dialect)} <=> ${renderExpression(ast.right, state, dialect)})`
        : `(${renderExpression(ast.left, state, dialect)} is not distinct from ${renderExpression(ast.right, state, dialect)})`
    case "isNull":
      return `(${renderExpression(ast.value, state, dialect)} is null)`
    case "isNotNull":
      return `(${renderExpression(ast.value, state, dialect)} is not null)`
    case "not":
      return `(not ${renderExpression(ast.value, state, dialect)})`
    case "upper":
      return `upper(${renderExpression(ast.value, state, dialect)})`
    case "lower":
      return `lower(${renderExpression(ast.value, state, dialect)})`
    case "count":
      return `count(${renderExpression(ast.value, state, dialect)})`
    case "max":
      return `max(${renderExpression(ast.value, state, dialect)})`
    case "min":
      return `min(${renderExpression(ast.value, state, dialect)})`
    case "and":
      return `(${ast.values.map((value: Expression.Any) => renderExpression(value, state, dialect)).join(" and ")})`
    case "or":
      return `(${ast.values.map((value: Expression.Any) => renderExpression(value, state, dialect)).join(" or ")})`
    case "coalesce":
      return `coalesce(${ast.values.map((value: Expression.Any) => renderExpression(value, state, dialect)).join(", ")})`
    case "in":
      return `(${renderExpression(ast.values[0]!, state, dialect)} in (${ast.values.slice(1).map((value: Expression.Any) => renderExpression(value, state, dialect)).join(", ")}))`
    case "notIn":
      return `(${renderExpression(ast.values[0]!, state, dialect)} not in (${ast.values.slice(1).map((value: Expression.Any) => renderExpression(value, state, dialect)).join(", ")}))`
    case "between":
      return `(${renderExpression(ast.values[0]!, state, dialect)} between ${renderExpression(ast.values[1]!, state, dialect)} and ${renderExpression(ast.values[2]!, state, dialect)})`
    case "concat":
      return dialect.renderConcat(ast.values.map((value: Expression.Any) => renderExpression(value, state, dialect)))
    case "case":
      return `case ${ast.branches.map((branch) =>
        `when ${renderExpression(branch.when, state, dialect)} then ${renderExpression(branch.then, state, dialect)}`
      ).join(" ")} else ${renderExpression(ast.else, state, dialect)} end`
    case "exists":
      return `exists (${renderQueryAst(
        Query.getAst(ast.plan) as QueryAst.Ast<Record<string, unknown>, any, QueryAst.QueryStatement>,
        state,
        dialect
      ).sql})`
    case "window": {
      if (!Array.isArray(ast.partitionBy) || !Array.isArray(ast.orderBy) || typeof ast.function !== "string") {
        break
      }
      const clauses: string[] = []
      if (ast.partitionBy.length > 0) {
        clauses.push(`partition by ${ast.partitionBy.map((value: Expression.Any) => renderExpression(value, state, dialect)).join(", ")}`)
      }
      if (ast.orderBy.length > 0) {
        clauses.push(`order by ${ast.orderBy.map((entry) =>
          `${renderExpression(entry.value, state, dialect)} ${entry.direction}`
        ).join(", ")}`)
      }
      const specification = clauses.join(" ")
      switch (ast.function) {
        case "rowNumber":
          return `row_number() over (${specification})`
        case "rank":
          return `rank() over (${specification})`
        case "denseRank":
          return `dense_rank() over (${specification})`
        case "over":
          return `${renderExpression(ast.value!, state, dialect)} over (${specification})`
      }
      break
    }
  }
  throw new Error("Unsupported expression for SQL rendering")
}
