import * as Expression from "./scalar.js"
import * as Plan from "./row-set.js"
import * as Table from "./table.js"

type DslPlanRuntimeContext = {
  readonly profile: {
    readonly dialect: string
  }
  readonly makePlan: (...args: readonly any[]) => any
  readonly getAst: (plan: any) => any
  readonly getQueryState: (plan: any) => any
  readonly currentRequiredList: (required: any) => readonly string[]
  readonly toDialectExpression: (value: any) => Expression.Any
  readonly toDialectNumericExpression: (value: any) => Expression.Any
  readonly extractRequiredFromDialectInputRuntime: (value: any) => readonly string[]
  readonly extractRequiredFromDialectNumericInputRuntime: (value: any) => readonly string[]
  readonly formulaOfExpressionRuntime: (value: Expression.Any) => any
  readonly assumeFormulaTrue: (assumptions: any, formula: any) => any
  readonly trueFormula: () => any
  readonly sourceDetails: (source: any) => { readonly sourceName: string; readonly sourceBaseName: string }
  readonly presenceWitnessesOfSourceLike: (source: any) => readonly string[]
  readonly attachInsertSource: (plan: any, source: any) => any
}

type LockMode = "update" | "share" | "lowPriority" | "ignore" | "quick"

export const renderSelectLockMode = (mode: LockMode): string =>
  mode === "update" ? "for update" : "for share"

export const renderMysqlMutationLockMode = (
  mode: LockMode,
  _statement: "update" | "delete"
): string => {
  if (mode === "lowPriority") {
    return " low_priority"
  }
  return mode === "ignore" ? " ignore" : " quick"
}

export const makeDslPlanRuntime = (ctx: DslPlanRuntimeContext) => {
  const aliasedSourceKinds = new Set(["derived", "cte", "lateral", "values", "unnest", "tableFunction"])
  const isRecord = (value: unknown): value is Record<PropertyKey, unknown> =>
    typeof value === "object" && value !== null

  const isPlan = (value: unknown): boolean => isRecord(value) && Plan.TypeId in value
  const hasColumnRecord = (value: Record<PropertyKey, unknown>): boolean => isRecord(value.columns)

  const sourceRequiredList = (source: any): readonly string[] =>
    typeof source === "object" && source !== null && "required" in source
      ? ctx.currentRequiredList(source.required)
      : []

  const isAliasedSource = (source: unknown): boolean => {
    if (!isRecord(source)) {
      return false
    }
    if (Table.TypeId in source) {
      return true
    }
    if (!("kind" in source) || !("name" in source) || !("baseName" in source)) {
      return false
    }
    if (typeof source.kind !== "string" || !aliasedSourceKinds.has(source.kind)) {
      return false
    }
    if (typeof source.name !== "string" || typeof source.baseName !== "string") {
      return false
    }
    switch (source.kind) {
      case "derived":
      case "cte":
      case "lateral":
        return isPlan(source.plan) && hasColumnRecord(source)
      case "values":
        return Array.isArray(source.rows) && hasColumnRecord(source)
      case "unnest":
        return isRecord(source.arrays) && hasColumnRecord(source)
      case "tableFunction":
        return typeof source.functionName === "string" && Array.isArray(source.args) && hasColumnRecord(source)
    }
    return false
  }

  const assertAliasedSource = (source: unknown, message: string): void => {
    if (!isAliasedSource(source)) {
      throw new Error(message)
    }
  }

  const assertPlanComplete = (plan: any): void => {
    const required = ctx.currentRequiredList(plan[Plan.TypeId].required)
    if (required.length > 0) {
      throw new Error(`query references sources that are not yet in scope: ${required.join(", ")}`)
    }
  }

  const assertSourceNameAvailable = (available: Record<string, unknown>, sourceName: string): void => {
    if (sourceName in available) {
      throw new Error(`query source name is already in scope: ${sourceName}`)
    }
  }

  const assertSelectHasBaseSourceForJoin = (statement: string, available: Record<string, unknown>): void => {
    if (statement === "select" && Object.keys(available).length === 0) {
      throw new Error("select joins require a from(...) source before joining")
    }
  }

  const supportsJoinSources = (statement: string): boolean =>
    statement === "select" || statement === "update" || statement === "delete"

  const assertSetOperandStatement = (plan: any): void => {
    const statement = ctx.getQueryState(plan).statement
    if (statement !== "select" && statement !== "set") {
      throw new Error("set operator operands only accept select-like query plans")
    }
  }

  const buildSetOperation = (kind: string, all: boolean, left: any, right: any) => {
    assertSetOperandStatement(left)
    assertSetOperandStatement(right)
    assertPlanComplete(left)
    assertPlanComplete(right)
    const leftState = left[Plan.TypeId]
    const leftAst = ctx.getAst(left)
    const basePlan = leftAst.kind === "set"
      ? leftAst.setBase ?? left
      : left
    const leftOperations = leftAst.kind === "set"
      ? [...(leftAst.setOperations ?? [])]
      : []
    return ctx.makePlan({
      selection: leftState.selection,
      required: undefined,
      available: {},
      dialect: leftState.dialect ?? right[Plan.TypeId].dialect
    }, {
      kind: "set",
      select: leftState.selection,
      where: [],
      having: [],
      joins: [],
      groupBy: [],
      orderBy: [],
      setBase: basePlan,
      setOperations: [
        ...leftOperations,
        {
          kind,
          all,
          query: right
        }
      ]
    }, undefined, undefined, "set")
  }

  const where = (predicate: any) =>
    (plan: any) => {
      const current = plan[Plan.TypeId]
      const currentAst = ctx.getAst(plan)
      const currentQuery = ctx.getQueryState(plan)
      const predicateExpression = ctx.toDialectExpression(predicate)
      const predicateRequired = ctx.extractRequiredFromDialectInputRuntime(predicate)
      return ctx.makePlan({
        selection: current.selection,
        required: [...ctx.currentRequiredList(current.required), ...predicateRequired].filter((name, index, values) =>
          !(name in current.available) && values.indexOf(name) === index),
        available: current.available,
        dialect: current.dialect ?? predicateExpression[Expression.TypeId].dialect
      }, {
        ...currentAst,
        where: [...currentAst.where, {
          kind: "where",
          predicate: predicateExpression
        }]
      }, ctx.assumeFormulaTrue(
        currentQuery.assumptions,
        ctx.formulaOfExpressionRuntime(predicateExpression)
      ), currentQuery.capabilities, currentQuery.statement)
    }

  const from = (source: any) =>
    (plan: any) => {
      const current = plan[Plan.TypeId]
      const currentAst = ctx.getAst(plan)
      const currentQuery = ctx.getQueryState(plan)

      if (currentQuery.statement === "insert") {
        return ctx.attachInsertSource(plan, source)
      }

      assertAliasedSource(source, "from(...) requires an aliased source in select/update statements")

      if (currentQuery.statement === "select" && currentAst.from !== undefined) {
        throw new Error("select statements accept only one from(...) source; use joins for additional sources")
      }

      const sourceLike = source
      const { sourceName, sourceBaseName } = ctx.sourceDetails(sourceLike)
      const presenceWitnesses = ctx.presenceWitnessesOfSourceLike(sourceLike)
      const sourceRequired = sourceRequiredList(sourceLike)
      assertSourceNameAvailable(current.available, sourceName)

      if (currentQuery.statement === "select") {
        const nextAvailable = {
          [sourceName]: {
            name: sourceName,
            mode: "required",
            baseName: sourceBaseName,
            _presentFormula: ctx.trueFormula(),
            _presenceWitnesses: presenceWitnesses
          }
        }
        return ctx.makePlan({
          selection: current.selection,
          required: [...ctx.currentRequiredList(current.required), ...sourceRequired].filter((name, index, values) =>
            !(name in nextAvailable) && values.indexOf(name) === index),
          available: nextAvailable,
          dialect: current.dialect
        }, {
          ...currentAst,
          from: {
            kind: "from",
            tableName: sourceName,
            baseTableName: sourceBaseName,
            source: sourceLike
          }
        }, currentQuery.assumptions, currentQuery.capabilities, currentQuery.statement)
      }

      if (currentQuery.statement === "update") {
        const nextAvailable = {
          ...current.available,
          [sourceName]: {
            name: sourceName,
            mode: "required",
            baseName: sourceBaseName,
            _presentFormula: ctx.trueFormula(),
            _presenceWitnesses: presenceWitnesses
          }
        }
        return ctx.makePlan({
          selection: current.selection,
          required: [...ctx.currentRequiredList(current.required), ...sourceRequired].filter((name, index, values) =>
            !(name in nextAvailable) && values.indexOf(name) === index),
          available: nextAvailable,
          dialect: current.dialect
        }, {
          ...currentAst,
          fromSources: [
            ...(currentAst.fromSources ?? []),
            {
              kind: "from",
              tableName: sourceName,
              baseTableName: sourceBaseName,
              source: sourceLike
            }
          ]
        }, currentQuery.assumptions, currentQuery.capabilities, currentQuery.statement)
      }

      throw new Error(`from(...) is not supported for ${currentQuery.statement} statements`)
    }

  const having = (predicate: any) =>
    (plan: any) => {
      const current = plan[Plan.TypeId]
      const currentAst = ctx.getAst(plan)
      const currentQuery = ctx.getQueryState(plan)
      const predicateExpression = ctx.toDialectExpression(predicate)
      const predicateRequired = ctx.extractRequiredFromDialectInputRuntime(predicate)
      return ctx.makePlan({
        selection: current.selection,
        required: [...ctx.currentRequiredList(current.required), ...predicateRequired].filter((name, index, values) =>
          !(name in current.available) && values.indexOf(name) === index),
        available: current.available,
        dialect: current.dialect ?? predicateExpression[Expression.TypeId].dialect
      }, {
        ...currentAst,
        having: [...currentAst.having, {
          kind: "having",
          predicate: predicateExpression
        }]
      }, ctx.assumeFormulaTrue(
        currentQuery.assumptions,
        ctx.formulaOfExpressionRuntime(predicateExpression)
      ), currentQuery.capabilities, currentQuery.statement)
    }

  const crossJoin = (table: any) =>
    (plan: any) => {
      const current = plan[Plan.TypeId]
      const currentAst = ctx.getAst(plan)
      const currentQuery = ctx.getQueryState(plan)
      if (supportsJoinSources(currentQuery.statement)) {
        assertAliasedSource(table, "join(...) requires an aliased source in select/update/delete statements")
        assertSelectHasBaseSourceForJoin(currentQuery.statement, current.available)
      }
      const { sourceName, sourceBaseName } = ctx.sourceDetails(table)
      const presenceWitnesses = ctx.presenceWitnessesOfSourceLike(table)
      const sourceRequired = sourceRequiredList(table)
      if (supportsJoinSources(currentQuery.statement)) {
        assertSourceNameAvailable(current.available, sourceName)
      }
      const nextAvailable = {
        ...current.available,
        [sourceName]: {
          name: sourceName,
          mode: "required",
          baseName: sourceBaseName,
          _presentFormula: ctx.trueFormula(),
          _presenceWitnesses: presenceWitnesses
        }
      }
      return ctx.makePlan({
        selection: current.selection,
        required: [...ctx.currentRequiredList(current.required), ...sourceRequired].filter((name, index, values) =>
          !(name in nextAvailable) && values.indexOf(name) === index),
        available: nextAvailable,
        dialect: current.dialect ?? table[Plan.TypeId]?.dialect ?? table.dialect
      }, {
        ...currentAst,
        joins: [...currentAst.joins, {
          kind: "cross",
          tableName: sourceName,
          baseTableName: sourceBaseName,
          source: table
        }]
      }, currentQuery.assumptions, currentQuery.capabilities, currentQuery.statement)
    }

  const join = (kind: string, table: any, on: any) =>
    (plan: any) => {
      const current = plan[Plan.TypeId]
      const currentAst = ctx.getAst(plan)
      const currentQuery = ctx.getQueryState(plan)
      const onExpression = ctx.toDialectExpression(on)
      const onFormula = ctx.formulaOfExpressionRuntime(onExpression)
      if (supportsJoinSources(currentQuery.statement)) {
        assertAliasedSource(table, "join(...) requires an aliased source in select/update/delete statements")
        assertSelectHasBaseSourceForJoin(currentQuery.statement, current.available)
      }
      const { sourceName, sourceBaseName } = ctx.sourceDetails(table)
      const presenceWitnesses = ctx.presenceWitnessesOfSourceLike(table)
      const sourceRequired = sourceRequiredList(table)
      if (supportsJoinSources(currentQuery.statement)) {
        assertSourceNameAvailable(current.available, sourceName)
      }
      const baseAvailable = (kind === "right" || kind === "full"
        ? Object.fromEntries(
          Object.entries(current.available as Record<string, any>).map(([name, source]) => [name, {
            name: source.name,
            mode: "optional",
            baseName: source.baseName,
            _presentFormula: source._presentFormula,
            _presenceWitnesses: source._presenceWitnesses
          }])
        )
        : current.available) as Record<string, any>
      const nextAvailable = {
        ...baseAvailable,
        [sourceName]: {
          name: sourceName,
          mode: (kind === "left" || kind === "full") ? "optional" : "required",
          baseName: sourceBaseName,
          _presentFormula: (kind === "inner" || kind === "left") ? onFormula : ctx.trueFormula(),
          _presenceWitnesses: presenceWitnesses
        }
      }
      return ctx.makePlan({
        selection: current.selection,
        required: [...ctx.currentRequiredList(current.required), ...sourceRequired, ...ctx.extractRequiredFromDialectInputRuntime(on)].filter((name, index, values) =>
          !(name in nextAvailable) && values.indexOf(name) === index),
        available: nextAvailable,
        dialect: current.dialect ?? table.dialect ?? onExpression[Expression.TypeId].dialect
      }, {
        ...currentAst,
        joins: [...currentAst.joins, {
          kind,
          tableName: sourceName,
          baseTableName: sourceBaseName,
          source: table,
          on: onExpression
        }]
      }, (
        kind === "inner"
          ? ctx.assumeFormulaTrue(currentQuery.assumptions, onFormula)
          : currentQuery.assumptions
      ), currentQuery.capabilities, currentQuery.statement)
    }

  const orderBy = (value: any, direction: "asc" | "desc" = "asc") =>
    (plan: any) => {
      const current = plan[Plan.TypeId]
      const currentAst = ctx.getAst(plan)
      const currentQuery = ctx.getQueryState(plan)
      const expression = ctx.toDialectExpression(value)
      const required = ctx.extractRequiredFromDialectInputRuntime(value)
      return ctx.makePlan({
        selection: current.selection,
        required: [...ctx.currentRequiredList(current.required), ...required].filter((name, index, values) =>
          !(name in current.available) && values.indexOf(name) === index),
        available: current.available,
        dialect: current.dialect ?? expression[Expression.TypeId].dialect
      }, {
        ...currentAst,
        orderBy: [...currentAst.orderBy, {
          kind: "orderBy",
          value: expression,
          direction
        }]
      }, currentQuery.assumptions, currentQuery.capabilities, currentQuery.statement)
    }

  const lock = (mode: string, options: { readonly nowait?: boolean; readonly skipLocked?: boolean } = {}) =>
    (plan: any) => {
      const current = plan[Plan.TypeId]
      const currentAst = ctx.getAst(plan)
      const currentQuery = ctx.getQueryState(plan)
      return ctx.makePlan({
        selection: current.selection,
        required: current.required,
        available: current.available,
        dialect: current.dialect
      }, {
        ...currentAst,
        lock: {
          kind: "lock",
          mode,
          nowait: options.nowait ?? false,
          skipLocked: options.skipLocked ?? false
        }
      }, currentQuery.assumptions, currentQuery.capabilities, currentQuery.statement)
    }

  const distinct = () =>
    (plan: any) => {
      const current = plan[Plan.TypeId]
      const currentAst = ctx.getAst(plan)
      const currentQuery = ctx.getQueryState(plan)
      return ctx.makePlan({
        selection: current.selection,
        required: current.required,
        available: current.available,
        dialect: current.dialect
      }, {
        ...currentAst,
        distinct: true
      }, currentQuery.assumptions, currentQuery.capabilities, currentQuery.statement)
    }

  const limit = (value: any) =>
    (plan: any) => {
      const current = plan[Plan.TypeId]
      const currentAst = ctx.getAst(plan)
      const currentQuery = ctx.getQueryState(plan)
      const expression = ctx.toDialectNumericExpression(value)
      const required = ctx.extractRequiredFromDialectNumericInputRuntime(value)
      return ctx.makePlan({
        selection: current.selection,
        required: [...ctx.currentRequiredList(current.required), ...required].filter((name, index, values) =>
          !(name in current.available) && values.indexOf(name) === index),
        available: current.available,
        dialect: current.dialect ?? expression[Expression.TypeId].dialect
      }, {
        ...currentAst,
        limit: expression
      }, currentQuery.assumptions, currentQuery.capabilities, currentQuery.statement)
    }

  const offset = (value: any) =>
    (plan: any) => {
      const current = plan[Plan.TypeId]
      const currentAst = ctx.getAst(plan)
      const currentQuery = ctx.getQueryState(plan)
      const expression = ctx.toDialectNumericExpression(value)
      const required = ctx.extractRequiredFromDialectNumericInputRuntime(value)
      return ctx.makePlan({
        selection: current.selection,
        required: [...ctx.currentRequiredList(current.required), ...required].filter((name, index, values) =>
          !(name in current.available) && values.indexOf(name) === index),
        available: current.available,
        dialect: current.dialect ?? expression[Expression.TypeId].dialect
      }, {
        ...currentAst,
        offset: expression
      }, currentQuery.assumptions, currentQuery.capabilities, currentQuery.statement)
    }

  return {
    buildSetOperation,
    where,
    from,
    having,
    crossJoin,
    join,
    orderBy,
    lock,
    distinct,
    limit,
    offset
  }
}
