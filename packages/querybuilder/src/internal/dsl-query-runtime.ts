import * as Expression from "./scalar.js"
import * as Plan from "./row-set.js"

type DslQueryRuntimeContext = {
  readonly profile: {
    readonly dialect: string
  }
  readonly ValuesInputProto: object
  readonly normalizeValuesRow: (row: any) => Record<string, Expression.Any>
  readonly normalizeUnnestColumns: (columns: any) => Record<string, readonly Expression.Any[]>
  readonly makeColumnReferenceSelection: (alias: string, selection: Record<string, Expression.Any>) => any
  readonly toDialectNumericExpression: (value: any) => Expression.Any
  readonly extractRequiredRuntime: (selection: any) => readonly string[]
  readonly makePlan: (...args: readonly any[]) => any
  readonly getAst: (plan: any) => any
  readonly getQueryState: (plan: any) => any
  readonly currentRequiredList: (required: any) => readonly string[]
  readonly dedupeGroupedExpressions: (values: readonly any[]) => any
}

export const makeDslQueryRuntime = (ctx: DslQueryRuntimeContext) => {
  const values = (rows: readonly [Record<string, any>, ...Record<string, any>[]]) => {
    if (rows.length === 0) {
      throw new Error("values(...) requires at least one row")
    }
    const normalizedRows = rows.map((row) => ctx.normalizeValuesRow(row)) as unknown as readonly [
      Record<string, Expression.Any>,
      ...Record<string, Expression.Any>[]
    ]
    const columnNames = Object.keys(normalizedRows[0]!)
    if (columnNames.length === 0) {
      throw new Error("values(...) rows must specify at least one column")
    }
    const columnNameSet = new Set(columnNames)
    for (const row of normalizedRows) {
      const rowKeys = Object.keys(row)
      if (rowKeys.length !== columnNames.length || !rowKeys.every((key) => columnNameSet.has(key))) {
        throw new Error("values(...) rows must project the same columns")
      }
    }
    return Object.assign(Object.create(ctx.ValuesInputProto), {
      kind: "values",
      dialect: ctx.profile.dialect,
      rows: normalizedRows,
      selection: normalizedRows[0]!
    })
  }

  const unnest = (columns: Record<string, readonly any[]>, alias: string) => {
    const normalizedColumns = ctx.normalizeUnnestColumns(columns)
    const columnNames = Object.keys(normalizedColumns)
    if (columnNames.length === 0) {
      throw new Error("unnest(...) requires at least one column array")
    }
    const firstColumn = normalizedColumns[columnNames[0] as keyof typeof normalizedColumns]
    const rowCount = firstColumn?.length ?? 0
    if (rowCount === 0) {
      throw new Error("unnest(...) requires at least one row")
    }
    for (const columnName of columnNames) {
      const values = normalizedColumns[columnName]!
      if (values.length !== rowCount) {
        throw new Error("unnest(...) column arrays must have the same length")
      }
    }
    const firstRow = Object.fromEntries(
      columnNames.map((columnName) => [columnName, normalizedColumns[columnName]![0]!])
    ) as Record<string, Expression.Any>
    const columnsSelection = ctx.makeColumnReferenceSelection(alias, firstRow)
    const source = {
      kind: "unnest",
      name: alias,
      baseName: alias,
      dialect: ctx.profile.dialect,
      values: columns,
      arrays: normalizedColumns,
      columns: columnsSelection
    }
    return Object.assign(source, columnsSelection)
  }

  const generateSeries = (start: any, stop: any, step?: any, alias = "series") => {
    const startExpression = ctx.toDialectNumericExpression(start)
    const stopExpression = ctx.toDialectNumericExpression(stop)
    const stepExpression = step === undefined ? undefined : ctx.toDialectNumericExpression(step)
    const valueSelection = {
      value: startExpression
    } as Record<string, Expression.Any>
    const columns = ctx.makeColumnReferenceSelection(alias, valueSelection)
    const source = {
      kind: "tableFunction",
      name: alias,
      baseName: alias,
      dialect: ctx.profile.dialect,
      functionName: "generate_series",
      args: stepExpression === undefined
        ? [startExpression, stopExpression] as readonly Expression.Any[]
        : [startExpression, stopExpression, stepExpression] as readonly Expression.Any[],
      columns
    }
    return Object.assign(source, columns)
  }

  const select = (selection: any = {}) => {
    return ctx.makePlan({
      selection,
      required: ctx.extractRequiredRuntime(selection),
      available: {},
      dialect: ctx.profile.dialect
    }, {
      kind: "select",
      select: selection,
      where: [],
      having: [],
      joins: [],
      groupBy: [],
      orderBy: []
    }, undefined, "read", "select")
  }

  const groupBy = (...values: readonly Expression.Any[]) =>
    (plan: any) => {
      const current = plan[Plan.TypeId]
      const currentAst = ctx.getAst(plan)
      const currentQuery = ctx.getQueryState(plan)
      const required = [...values.flatMap((value) => Object.keys(value[Expression.TypeId].dependencies))].filter((name, index, list) =>
        !(name in current.available) && list.indexOf(name) === index)
      return ctx.makePlan({
        selection: current.selection,
        required: [...ctx.currentRequiredList(current.required), ...required].filter((name, index, list) =>
          !(name in current.available) && list.indexOf(name) === index),
        available: current.available,
        dialect: current.dialect
      }, {
        ...currentAst,
        groupBy: ctx.dedupeGroupedExpressions([...currentAst.groupBy, ...values])
      }, currentQuery.assumptions, currentQuery.capabilities, currentQuery.statement)
    }

  const returning = (selection: any) => {
    return (plan: any) => {
      const current = plan[Plan.TypeId]
      const currentAst = ctx.getAst(plan)
      const currentQuery = ctx.getQueryState(plan)
      return ctx.makePlan({
        selection,
        required: [...ctx.currentRequiredList(current.required), ...ctx.extractRequiredRuntime(selection)].filter((name, index, list) =>
          !(name in current.available) && list.indexOf(name) === index),
        available: current.available,
        dialect: current.dialect
      }, {
        ...currentAst,
        select: selection
      }, currentQuery.assumptions, currentQuery.capabilities, currentQuery.statement, currentQuery.target, currentQuery.insertSource)
    }
  }

  return {
    values,
    unnest,
    generateSeries,
    select,
    groupBy,
    returning
  }
}
