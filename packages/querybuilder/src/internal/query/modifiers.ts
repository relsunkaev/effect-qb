import { assumeFormulaTrue, formulaOfExpression as formulaOfExpressionRuntime, trueFormula } from "../predicate/runtime.js"
import type * as QueryAst from "./ast.js"
import { makeRuntimePlan, getAst, getQueryState, currentRequiredList } from "./plan.js"
import * as Expression from "../scalar.js"
import * as Plan from "../row-set.js"

type DslPlanRuntimeContext = {
  readonly profile: {
    readonly dialect: string
  }
  readonly toDialectExpression: (value: any) => Expression.Any
  readonly toDialectNumericExpression: (value: any) => Expression.Any
  readonly extractRequiredFromDialectInputRuntime: (value: any) => readonly string[]
  readonly extractRequiredFromDialectNumericInputRuntime: (value: any) => readonly string[]
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
  const sourceRequiredList = (source: any): readonly string[] =>
    typeof source === "object" && source !== null && "required" in source
      ? currentRequiredList(source.required)
      : []

  const buildSetOperation = (kind: QueryAst.SetOperatorKind, all: boolean, left: any, right: any) => {
    const leftState = left[Plan.TypeId]
    const leftAst = getAst(left)
    const basePlan = leftAst.kind === "set"
      ? leftAst.setBase ?? left
      : left
    const leftOperations = leftAst.kind === "set"
      ? [...(leftAst.setOperations ?? [])]
      : []
    return makeRuntimePlan({
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
    }, {
      statement: "set"
    })
  }

  const where = (predicate: any) =>
    (plan: any) => {
      const current = plan[Plan.TypeId]
      const currentAst = getAst(plan)
      const currentQuery = getQueryState(plan)
      const predicateExpression = ctx.toDialectExpression(predicate)
      const predicateRequired = ctx.extractRequiredFromDialectInputRuntime(predicate)
      return makeRuntimePlan({
        selection: current.selection,
        required: [...currentRequiredList(current.required), ...predicateRequired].filter((name, index, values) =>
          !(name in current.available) && values.indexOf(name) === index),
        available: current.available,
        dialect: current.dialect ?? predicateExpression[Expression.TypeId].dialect
      }, {
        ...currentAst,
        where: [...currentAst.where, {
          kind: "where",
          predicate: predicateExpression
        }]
      }, {
        assumptions: assumeFormulaTrue(
          currentQuery.assumptions,
          formulaOfExpressionRuntime(predicateExpression)
        ),
        capabilities: currentQuery.capabilities,
        statement: currentQuery.statement
      })
    }

  const from = (source: any) =>
    (plan: any) => {
      const current = plan[Plan.TypeId]
      const currentAst = getAst(plan)
      const currentQuery = getQueryState(plan)

      if (currentQuery.statement === "insert") {
        return ctx.attachInsertSource(plan, source)
      }

      const sourceLike = source
      const { sourceName, sourceBaseName } = ctx.sourceDetails(sourceLike)
      const presenceWitnesses = ctx.presenceWitnessesOfSourceLike(sourceLike)
      const sourceRequired = sourceRequiredList(sourceLike)

      if (currentQuery.statement === "select") {
        const nextAvailable = {
          [sourceName]: {
            name: sourceName,
            mode: "required" as const,
            baseName: sourceBaseName,
            _presentFormula: trueFormula(),
            _presenceWitnesses: presenceWitnesses
          }
        }
        return makeRuntimePlan({
          selection: current.selection,
          required: [...currentRequiredList(current.required), ...sourceRequired].filter((name, index, values) =>
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
        }, {
          assumptions: currentQuery.assumptions,
          capabilities: currentQuery.capabilities,
          statement: currentQuery.statement
        })
      }

      if (currentQuery.statement === "update") {
        const nextAvailable = {
          ...current.available,
          [sourceName]: {
            name: sourceName,
            mode: "required" as const,
            baseName: sourceBaseName,
            _presentFormula: trueFormula(),
            _presenceWitnesses: presenceWitnesses
          }
        }
        return makeRuntimePlan({
          selection: current.selection,
          required: [...currentRequiredList(current.required), ...sourceRequired].filter((name, index, values) =>
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
        }, {
          assumptions: currentQuery.assumptions,
          capabilities: currentQuery.capabilities,
          statement: currentQuery.statement
        })
      }

      return plan
    }

  const having = (predicate: any) =>
    (plan: any) => {
      const current = plan[Plan.TypeId]
      const currentAst = getAst(plan)
      const currentQuery = getQueryState(plan)
      const predicateExpression = ctx.toDialectExpression(predicate)
      const predicateRequired = ctx.extractRequiredFromDialectInputRuntime(predicate)
      return makeRuntimePlan({
        selection: current.selection,
        required: [...currentRequiredList(current.required), ...predicateRequired].filter((name, index, values) =>
          !(name in current.available) && values.indexOf(name) === index),
        available: current.available,
        dialect: current.dialect ?? predicateExpression[Expression.TypeId].dialect
      }, {
        ...currentAst,
        having: [...currentAst.having, {
          kind: "having",
          predicate: predicateExpression
        }]
      }, {
        assumptions: assumeFormulaTrue(
          currentQuery.assumptions,
          formulaOfExpressionRuntime(predicateExpression)
        ),
        capabilities: currentQuery.capabilities,
        statement: currentQuery.statement
      })
    }

  const crossJoin = (table: any) =>
    (plan: any) => {
      const current = plan[Plan.TypeId]
      const currentAst = getAst(plan)
      const currentQuery = getQueryState(plan)
      const { sourceName, sourceBaseName } = ctx.sourceDetails(table)
      const presenceWitnesses = ctx.presenceWitnessesOfSourceLike(table)
      const sourceRequired = sourceRequiredList(table)
      const nextAvailable = {
        ...current.available,
        [sourceName]: {
          name: sourceName,
          mode: "required" as const,
          baseName: sourceBaseName,
          _presentFormula: trueFormula(),
          _presenceWitnesses: presenceWitnesses
        }
      }
      return makeRuntimePlan({
        selection: current.selection,
        required: [...currentRequiredList(current.required), ...sourceRequired].filter((name, index, values) =>
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
      }, {
        assumptions: currentQuery.assumptions,
        capabilities: currentQuery.capabilities,
        statement: currentQuery.statement
      })
    }

  const join = (kind: QueryAst.JoinKind, table: any, on: any) =>
    (plan: any) => {
      const current = plan[Plan.TypeId]
      const currentAst = getAst(plan)
      const currentQuery = getQueryState(plan)
      const onExpression = ctx.toDialectExpression(on)
      const onFormula = formulaOfExpressionRuntime(onExpression)
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
          _presentFormula: (kind === "inner" || kind === "left") ? onFormula : trueFormula(),
          _presenceWitnesses: presenceWitnesses
        }
      }
      return makeRuntimePlan({
        selection: current.selection,
        required: [...currentRequiredList(current.required), ...sourceRequired, ...ctx.extractRequiredFromDialectInputRuntime(on)].filter((name, index, values) =>
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
      }, {
        assumptions: kind === "inner"
          ? assumeFormulaTrue(currentQuery.assumptions, onFormula)
          : currentQuery.assumptions,
        capabilities: currentQuery.capabilities,
        statement: currentQuery.statement
      })
    }

  const orderBy = (value: any, direction: "asc" | "desc" = "asc") =>
    (plan: any) => {
      const current = plan[Plan.TypeId]
      const currentAst = getAst(plan)
      const currentQuery = getQueryState(plan)
      const expression = ctx.toDialectExpression(value)
      const required = ctx.extractRequiredFromDialectInputRuntime(value)
      return makeRuntimePlan({
        selection: current.selection,
        required: [...currentRequiredList(current.required), ...required].filter((name, index, values) =>
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
      }, {
        assumptions: currentQuery.assumptions,
        capabilities: currentQuery.capabilities,
        statement: currentQuery.statement
      })
    }

  const lock = (mode: LockMode, options: { readonly nowait?: boolean; readonly skipLocked?: boolean } = {}) =>
    (plan: any) => {
      const current = plan[Plan.TypeId]
      const currentAst = getAst(plan)
      const currentQuery = getQueryState(plan)
      return makeRuntimePlan({
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
      }, {
        assumptions: currentQuery.assumptions,
        capabilities: currentQuery.capabilities,
        statement: currentQuery.statement
      })
    }

  const distinct = () =>
    (plan: any) => {
      const current = plan[Plan.TypeId]
      const currentAst = getAst(plan)
      const currentQuery = getQueryState(plan)
      return makeRuntimePlan({
        selection: current.selection,
        required: current.required,
        available: current.available,
        dialect: current.dialect
      }, {
        ...currentAst,
        distinct: true
      }, {
        assumptions: currentQuery.assumptions,
        capabilities: currentQuery.capabilities,
        statement: currentQuery.statement
      })
    }

  const limit = (value: any) =>
    (plan: any) => {
      const current = plan[Plan.TypeId]
      const currentAst = getAst(plan)
      const currentQuery = getQueryState(plan)
      const expression = ctx.toDialectNumericExpression(value)
      const required = ctx.extractRequiredFromDialectNumericInputRuntime(value)
      return makeRuntimePlan({
        selection: current.selection,
        required: [...currentRequiredList(current.required), ...required].filter((name, index, values) =>
          !(name in current.available) && values.indexOf(name) === index),
        available: current.available,
        dialect: current.dialect ?? expression[Expression.TypeId].dialect
      }, {
        ...currentAst,
        limit: expression
      }, {
        assumptions: currentQuery.assumptions,
        capabilities: currentQuery.capabilities,
        statement: currentQuery.statement
      })
    }

  const offset = (value: any) =>
    (plan: any) => {
      const current = plan[Plan.TypeId]
      const currentAst = getAst(plan)
      const currentQuery = getQueryState(plan)
      const expression = ctx.toDialectNumericExpression(value)
      const required = ctx.extractRequiredFromDialectNumericInputRuntime(value)
      return makeRuntimePlan({
        selection: current.selection,
        required: [...currentRequiredList(current.required), ...required].filter((name, index, values) =>
          !(name in current.available) && values.indexOf(name) === index),
        available: current.available,
        dialect: current.dialect ?? expression[Expression.TypeId].dialect
      }, {
        ...currentAst,
        offset: expression
      }, {
        assumptions: currentQuery.assumptions,
        capabilities: currentQuery.capabilities,
        statement: currentQuery.statement
      })
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
