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

export const makeDslPlanRuntime = (ctx: DslPlanRuntimeContext) => {
  const sourceRequiredList = (source: any): readonly string[] =>
    typeof source === "object" && source !== null && "required" in source
      ? ctx.currentRequiredList(source.required)
      : []

  const assertPlanComplete = (plan: any): void => {
    const required = ctx.currentRequiredList(plan[Plan.TypeId].required)
    if (required.length > 0) {
      throw new Error(`query references sources that are not yet in scope: ${required.join(", ")}`)
    }
  }

  const buildSetOperation = (kind: string, all: boolean, left: any, right: any) => {
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

      if (
        typeof source !== "object" ||
        source === null ||
        ("kind" in source && source.kind === "values" && !("name" in source)) ||
        (!(Table.TypeId in source) && !("name" in source && "baseName" in source))
      ) {
        throw new Error("from(...) requires an aliased source in select/update statements")
      }

      const sourceLike = source
      const { sourceName, sourceBaseName } = ctx.sourceDetails(sourceLike)
      const presenceWitnesses = ctx.presenceWitnessesOfSourceLike(sourceLike)
      const sourceRequired = sourceRequiredList(sourceLike)

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
      const { sourceName, sourceBaseName } = ctx.sourceDetails(table)
      const presenceWitnesses = ctx.presenceWitnessesOfSourceLike(table)
      const sourceRequired = sourceRequiredList(table)
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
      const { sourceName, sourceBaseName } = ctx.sourceDetails(table)
      const presenceWitnesses = ctx.presenceWitnessesOfSourceLike(table)
      const sourceRequired = sourceRequiredList(table)
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
      if (direction !== "asc" && direction !== "desc") {
        throw new Error("orderBy(...) direction must be asc or desc")
      }
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
      if (currentQuery.statement === "select" && mode !== "update" && mode !== "share") {
        throw new Error("lock(...) mode must be update or share for select statements")
      }
      if (
        ctx.profile.dialect === "mysql" &&
        currentQuery.statement === "update" &&
        mode !== "lowPriority" &&
        mode !== "ignore"
      ) {
        throw new Error("lock(...) mode must be lowPriority or ignore for update statements")
      }
      if (
        ctx.profile.dialect === "mysql" &&
        currentQuery.statement === "delete" &&
        mode !== "lowPriority" &&
        mode !== "quick" &&
        mode !== "ignore"
      ) {
        throw new Error("lock(...) mode must be lowPriority, quick, or ignore for delete statements")
      }
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
