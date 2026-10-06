import { dedupeGroupedExpressions } from "../grouping-key.js"
import { makeRuntimePlan, getAst, updatePlan, extractRequiredRuntime } from "./plan.js"
import type * as Query from "./plan.js"
import * as Expression from "../scalar.js"

type DslQueryRuntimeContext = {
  readonly profile: {
    readonly dialect: string
  }
  readonly ValuesInputProto: object
  readonly normalizeValuesRow: (row: any) => Record<string, Expression.Any>
  readonly normalizeUnnestColumns: (columns: any) => Record<string, readonly Expression.Any[]>
  readonly makeColumnReferenceSelection: (alias: string, selection: Record<string, Expression.Any>) => any
  readonly toDialectNumericExpression: (value: any) => Expression.Any
}

export const makeDslQueryRuntime = (ctx: DslQueryRuntimeContext) => {
  const values = (rows: readonly [Record<string, any>, ...Record<string, any>[]]) => {
    const [first, ...rest] = rows
    const normalizedRows = [
      ctx.normalizeValuesRow(first),
      ...rest.map((row) => ctx.normalizeValuesRow(row))
    ] satisfies readonly [Record<string, Expression.Any>, ...Record<string, Expression.Any>[]]
    const columnNames = Object.keys(normalizedRows[0]!)
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
    return makeRuntimePlan({
      selection,
      required: extractRequiredRuntime(selection),
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
    }, {
      capabilities: "read",
      statement: "select"
    })
  }

  const groupBy = (...values: readonly Expression.Any[]) =>
    (plan: Query.Plan.Any) => updatePlan(plan, {
      ast: {
        groupBy: dedupeGroupedExpressions([...getAst(plan).groupBy, ...values])
      },
      additionalRequired: values.flatMap((value) => Object.keys(value[Expression.TypeId].dependencies))
    })

  const returning = (selection: Query.SelectionShape) =>
    (plan: Query.Plan.Any) => updatePlan(plan, {
      ast: { select: selection },
      additionalRequired: extractRequiredRuntime(selection)
    })

  return {
    values,
    unnest,
    generateSeries,
    select,
    groupBy,
    returning
  }
}
