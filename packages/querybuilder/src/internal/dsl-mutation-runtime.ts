import * as Expression from "./scalar.js"
import * as Plan from "./row-set.js"

type DslMutationRuntimeContext = {
  readonly makePlan: (...args: readonly any[]) => any
  readonly getAst: (plan: any) => any
  readonly getQueryState: (plan: any) => any
  readonly currentRequiredList: (required: any) => readonly string[]
  readonly toDialectExpression: (value: any) => Expression.Any
  readonly buildMutationAssignments: (target: any, values: Record<string, unknown>) => readonly any[]
  readonly buildInsertValuesRows: (target: any, rows: readonly [Record<string, unknown>, ...Record<string, unknown>[]]) => any
  readonly normalizeInsertUnnestValues: (target: any, values: any) => any
  readonly normalizeInsertSelectColumns: (selection: Record<string, Expression.Any>) => readonly string[]
  readonly buildConflictTarget: (target: any, input: any) => any
  readonly mutationTargetClauses: (target: any) => readonly any[]
  readonly mutationAvailableSources: (target: any) => Record<string, any>
  readonly normalizeColumnList: (columns: string | readonly string[]) => readonly string[]
  readonly targetSourceDetails: (target: any) => { readonly sourceName: string; readonly sourceBaseName: string }
  readonly sourceDetails: (source: any) => { readonly sourceName: string; readonly sourceBaseName: string }
}

export const makeDslMutationRuntime = (ctx: DslMutationRuntimeContext) => {
  const insert = (target: any, values?: Record<string, unknown>) => {
    const { sourceName, sourceBaseName } = ctx.targetSourceDetails(target)
    const assignments = values === undefined
      ? []
      : ctx.buildMutationAssignments(target, values)
    const required = assignments.flatMap((entry) => Object.keys(entry.value[Expression.TypeId].dependencies))
    const insertState = values === undefined ? "missing" : "ready"
    return ctx.makePlan({
      selection: {},
      required: required.filter((name, index, list) => name !== sourceName && list.indexOf(name) === index),
      available: {
        [sourceName]: {
          name: sourceName,
          mode: "required",
          baseName: sourceBaseName
        }
      },
      dialect: target[Plan.TypeId].dialect
    }, {
      kind: "insert",
      select: {},
      into: {
        kind: "from",
        tableName: sourceName,
        baseTableName: sourceBaseName,
        source: target
      },
      values: assignments,
      conflict: undefined,
      where: [],
      having: [],
      joins: [],
      groupBy: [],
      orderBy: []
    }, undefined, "write", "insert", target, insertState)
  }

  const attachInsertSource = (plan: any, source: any) => {
    const current = plan[Plan.TypeId]
    const currentAst = ctx.getAst(plan)
    const currentQuery = ctx.getQueryState(plan)
    const target = currentQuery.target
    const sourceName = currentAst.into!.tableName

    if (typeof source === "object" && source !== null && "kind" in source && source.kind === "values") {
      const normalized = ctx.buildInsertValuesRows(target, source.rows)
      return ctx.makePlan({
        selection: current.selection,
        required: normalized.required.filter((name: string) => name !== sourceName),
        available: current.available,
        dialect: current.dialect
      }, {
        ...currentAst,
        values: [],
        insertSource: {
          kind: "values",
          columns: normalized.columns,
          rows: normalized.rows
        }
      }, currentQuery.assumptions, currentQuery.capabilities, currentQuery.statement, currentQuery.target, "ready")
    }

    if (typeof source === "object" && source !== null && "kind" in source && source.kind === "unnest") {
      const normalized = ctx.normalizeInsertUnnestValues(target, source.values)
      return ctx.makePlan({
        selection: current.selection,
        required: [],
        available: current.available,
        dialect: current.dialect
      }, {
        ...currentAst,
        values: [],
        insertSource: {
          kind: "unnest",
          columns: normalized.columns,
          values: normalized.values
        }
      }, currentQuery.assumptions, currentQuery.capabilities, currentQuery.statement, currentQuery.target, "ready")
    }

    const sourcePlan = source
    const selection = sourcePlan[Plan.TypeId].selection as Record<string, Expression.Any>
    const columns = ctx.normalizeInsertSelectColumns(selection)
    return ctx.makePlan({
      selection: current.selection,
      required: ctx.currentRequiredList(sourcePlan[Plan.TypeId].required),
      available: current.available,
      dialect: current.dialect
    }, {
      ...currentAst,
      values: [],
      insertSource: {
        kind: "query",
        columns,
        query: sourcePlan
      }
    }, currentQuery.assumptions, currentQuery.capabilities, currentQuery.statement, currentQuery.target, "ready")
  }

  const onConflict = (target: any, options: any = {}) =>
    (plan: any) => {
      const current = plan[Plan.TypeId]
      const currentAst = ctx.getAst(plan)
      const currentQuery = ctx.getQueryState(plan)
      const insertTarget = currentAst.into!.source
      const conflictTarget = ctx.buildConflictTarget(insertTarget, target)
      const updateAssignments = options.update
        ? ctx.buildMutationAssignments(insertTarget, options.update)
        : []
      if (options.update !== undefined && updateAssignments.length === 0) {
        throw new Error("conflict update assignments require at least one assignment")
      }
      const updateWhere = options.where === undefined
        ? undefined
        : ctx.toDialectExpression(options.where)
      const targetWhere = conflictTarget.kind === "columns" ? conflictTarget.where : undefined
      const required = [
        ...ctx.currentRequiredList(current.required),
        ...updateAssignments.flatMap((entry) => Object.keys(entry.value[Expression.TypeId].dependencies)),
        ...(updateWhere ? Object.keys(updateWhere[Expression.TypeId].dependencies) : []),
        ...(targetWhere ? Object.keys(targetWhere[Expression.TypeId].dependencies) : [])
      ].filter((name, index, list) =>
        !(name in current.available) && list.indexOf(name) === index)
      return ctx.makePlan({
        selection: current.selection,
        required,
        available: current.available,
        dialect: current.dialect
      }, {
        ...currentAst,
        conflict: {
          kind: "conflict",
          target: conflictTarget,
          action: updateAssignments.length === 0 ? "doNothing" : "doUpdate",
          values: updateAssignments.length === 0 ? undefined : updateAssignments,
          where: updateWhere
        }
      }, currentQuery.assumptions, currentQuery.capabilities, currentQuery.statement, currentQuery.target, currentQuery.insertSource)
    }

  const update = (target: any, values: Record<string, unknown>) => {
    const targets = ctx.mutationTargetClauses(target)
    const primaryTarget = targets[0]!
    const assignments = ctx.buildMutationAssignments(target, values)
    const targetNames = new Set(targets.map((entry: any) => entry.tableName))
    const required = assignments
      .flatMap((entry) => Object.keys(entry.value[Expression.TypeId].dependencies))
      .filter((name, index, list) => !targetNames.has(name) && list.indexOf(name) === index)
    return ctx.makePlan({
      selection: {},
      required,
      available: ctx.mutationAvailableSources(target),
      dialect: primaryTarget.source[Plan.TypeId].dialect
    }, {
      kind: "update",
      select: {},
      target: primaryTarget,
      targets,
      set: assignments,
      where: [],
      having: [],
      joins: [],
      groupBy: [],
      orderBy: []
    }, undefined, "write", "update")
  }

  const upsert = (target: any, values: Record<string, unknown>, conflictColumns: string | readonly string[], updateValues?: Record<string, unknown>) => {
    const { sourceName, sourceBaseName } = ctx.targetSourceDetails(target)
    const assignments = ctx.buildMutationAssignments(target, values)
    const updateAssignments = updateValues ? ctx.buildMutationAssignments(target, updateValues) : []
    if (updateValues !== undefined && updateAssignments.length === 0) {
      throw new Error("upsert update assignments require at least one assignment")
    }
    const required = [
      ...assignments.flatMap((entry) => Object.keys(entry.value[Expression.TypeId].dependencies)),
      ...updateAssignments.flatMap((entry) => Object.keys(entry.value[Expression.TypeId].dependencies))
    ]
    return ctx.makePlan({
      selection: {},
      required: required.filter((name, index, list) => name !== sourceName && list.indexOf(name) === index),
      available: {
        [sourceName]: {
          name: sourceName,
          mode: "required",
          baseName: sourceBaseName
        }
      },
      dialect: target[Plan.TypeId].dialect
    }, {
      kind: "insert",
      select: {},
      into: {
        kind: "from",
        tableName: sourceName,
        baseTableName: sourceBaseName,
        source: target
      },
      values: assignments,
      conflict: {
        kind: "conflict",
        target: {
          kind: "columns",
          columns: ctx.normalizeColumnList(conflictColumns) as readonly [string, ...string[]]
        },
        action: updateAssignments.length > 0 ? "doUpdate" : "doNothing",
        values: updateAssignments.length > 0 ? updateAssignments : undefined
      },
      where: [],
      having: [],
      joins: [],
      groupBy: [],
      orderBy: []
    }, undefined, "write", "insert", target, "ready")
  }

  const delete_ = (target: any) => {
    const targets = ctx.mutationTargetClauses(target)
    const primaryTarget = targets[0]!
    return ctx.makePlan({
      selection: {},
      required: [],
      available: ctx.mutationAvailableSources(target),
      dialect: primaryTarget.source[Plan.TypeId].dialect
    }, {
      kind: "delete",
      select: {},
      target: primaryTarget,
      targets,
      where: [],
      having: [],
      joins: [],
      groupBy: [],
      orderBy: []
    }, undefined, "write", "delete")
  }

  const truncate = (target: any, options: { readonly restartIdentity?: boolean; readonly cascade?: boolean } = {}) => {
    const { sourceName, sourceBaseName } = ctx.targetSourceDetails(target)
    return ctx.makePlan({
      selection: {},
      required: [],
      available: {},
      dialect: target[Plan.TypeId].dialect
    }, {
      kind: "truncate",
      select: {},
      target: {
        kind: "from",
        tableName: sourceName,
        baseTableName: sourceBaseName,
        source: target
      },
      truncate: {
        kind: "truncate",
        restartIdentity: options.restartIdentity ?? false,
        cascade: options.cascade ?? false
      },
      where: [],
      having: [],
      joins: [],
      groupBy: [],
      orderBy: []
    }, undefined, "write", "truncate")
  }

  const merge = (target: any, source: any, on: any, options: any = {}) => {
    const { sourceName: targetName, sourceBaseName: targetBaseName } = ctx.targetSourceDetails(target)
    const { sourceName: usingName, sourceBaseName: usingBaseName } = ctx.sourceDetails(source)
    const onExpression = ctx.toDialectExpression(on)
    const matched = options.whenMatched
    const notMatched = options.whenNotMatched
    if (matched && "delete" in matched && "update" in matched) {
      throw new Error("merge whenMatched cannot specify both update and delete")
    }
    const matchedPredicate = matched?.predicate ? ctx.toDialectExpression(matched.predicate) : undefined
    const matchedAssignments = matched && "update" in matched && matched.update
      ? ctx.buildMutationAssignments(target, matched.update)
      : []
    const notMatchedPredicate = notMatched?.predicate ? ctx.toDialectExpression(notMatched.predicate) : undefined
    const notMatchedAssignments = notMatched
      ? ctx.buildMutationAssignments(target, notMatched.values)
      : []
    const required = [
      ...Object.keys(onExpression[Expression.TypeId].dependencies),
      ...matchedAssignments.flatMap((entry) => Object.keys(entry.value[Expression.TypeId].dependencies)),
      ...notMatchedAssignments.flatMap((entry) => Object.keys(entry.value[Expression.TypeId].dependencies)),
      ...(matchedPredicate ? Object.keys(matchedPredicate[Expression.TypeId].dependencies) : []),
      ...(notMatchedPredicate ? Object.keys(notMatchedPredicate[Expression.TypeId].dependencies) : [])
    ].filter((name, index, values) =>
      name !== targetName && name !== usingName && values.indexOf(name) === index)
    return ctx.makePlan({
      selection: {},
      required,
      available: {
        [targetName]: {
          name: targetName,
          mode: "required",
          baseName: targetBaseName
        },
        [usingName]: {
          name: usingName,
          mode: "required",
          baseName: usingBaseName
        }
      },
      dialect: target[Plan.TypeId].dialect
    }, {
      kind: "merge",
      select: {},
      target: {
        kind: "from",
        tableName: targetName,
        baseTableName: targetBaseName,
        source: target
      },
      using: {
        kind: "from",
        tableName: usingName,
        baseTableName: usingBaseName,
        source
      },
      merge: {
        kind: "merge",
        on: onExpression,
        whenMatched: matched
          ? ("delete" in matched && matched.delete
            ? {
                kind: "delete",
                predicate: matchedPredicate
              }
            : {
                kind: "update",
                values: matchedAssignments,
                predicate: matchedPredicate
              })
          : undefined,
        whenNotMatched: notMatched
          ? {
              kind: "insert",
              values: notMatchedAssignments,
              predicate: notMatchedPredicate
            }
          : undefined
      },
      where: [],
      having: [],
      joins: [],
      groupBy: [],
      orderBy: []
    }, undefined, "write", "merge")
  }

  return {
    insert,
    attachInsertSource,
    onConflict,
    update,
    upsert,
    delete_,
    truncate,
    merge
  }
}
