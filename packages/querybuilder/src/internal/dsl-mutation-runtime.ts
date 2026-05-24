import * as Expression from "./scalar.js"
import * as Plan from "./row-set.js"
import * as Table from "./table.js"
import { normalizeStatementFlag } from "./dsl-transaction-ddl-runtime.js"

type DslMutationRuntimeContext = {
  readonly profile: {
    readonly dialect: string
  }
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
  readonly normalizeConflictColumns: (target: any, columns: string | readonly string[]) => readonly string[]
  readonly targetSourceDetails: (target: any) => { readonly sourceName: string; readonly sourceBaseName: string }
  readonly sourceDetails: (source: any) => { readonly sourceName: string; readonly sourceBaseName: string }
}

const isKnownTargetColumn = (
  columnName: unknown,
  fields: Record<string, unknown> | undefined
): columnName is string =>
  typeof columnName === "string" && columnName.length > 0 && (fields === undefined || columnName in fields)

const expectKnownTargetColumns = (
  columns: readonly unknown[],
  fields: Record<string, unknown> | undefined,
  message: string
): void => {
  if (columns.length === 0 || columns.some((columnName) => !isKnownTargetColumn(columnName, fields))) {
    throw new Error(message)
  }
}

export const expectInsertSourceKind = <
  Source extends { readonly kind: string } | undefined
>(
  source: Source,
  fields?: Record<string, unknown>
): Source => {
  if (source === undefined) {
    return source
  }
  if (
    source.kind !== "values" &&
    source.kind !== "query" &&
    source.kind !== "unnest"
  ) {
    throw new Error("Unsupported insert source kind")
  }
  const columns = (source as { readonly columns?: unknown }).columns
  if (!Array.isArray(columns)) {
    throw new Error("insert sources require a column array")
  }
  expectKnownTargetColumns(
    columns,
    fields,
    "insert sources require known target columns"
  )
  if (source.kind === "unnest") {
    const values = (source as { readonly values?: unknown }).values
    if (!Array.isArray(values)) {
      throw new Error("unnest insert sources require a value array")
    }
    for (const entry of values) {
      if (typeof entry !== "object" || entry === null || typeof (entry as { readonly columnName?: unknown }).columnName !== "string") {
        throw new Error("unnest insert sources require known target columns")
      }
      if (fields !== undefined && !((entry as { readonly columnName: string }).columnName in fields)) {
        throw new Error("unnest insert sources require known target columns")
      }
      if (!Array.isArray((entry as { readonly values?: unknown }).values)) {
        throw new Error("unnest insert source entries require value arrays")
      }
    }
  }
  return source
}

export const expectInsertValues = <
  Values extends readonly { readonly columnName: string }[] | undefined
>(
  values: Values,
  fields: Record<string, unknown>
): Values => {
  if (values === undefined) {
    return values
  }
  if (!Array.isArray(values)) {
    throw new Error("insert values require an assignment array")
  }
  if (values.length === 0) {
    return values
  }
  expectKnownTargetColumns(
    values.map((entry) => typeof entry === "object" && entry !== null ? entry.columnName : undefined),
    fields,
    "insert values require known target columns"
  )
  return values
}

export const expectConflictClause = <
  Conflict extends {
    readonly kind: string
    readonly action: string
    readonly target?: { readonly kind: string; readonly name?: string }
  } | undefined
>(
  conflict: Conflict
): Conflict => {
  if (conflict?.target?.kind === "constraint" && conflict.target.name === "") {
    throw new Error("conflict constraint targets require a non-empty string")
  }
  return conflict
}

export const makeDslMutationRuntime = (ctx: DslMutationRuntimeContext) => {
  const aliasedSourceKinds = new Set(["derived", "cte", "lateral", "values", "unnest", "tableFunction"])
  const isRecord = (value: unknown): value is Record<PropertyKey, unknown> =>
    typeof value === "object" && value !== null

  const isTableTarget = (target: unknown): boolean =>
    typeof target === "object" && target !== null && Table.TypeId in target && Plan.TypeId in target

  const hasColumnRecord = (value: Record<PropertyKey, unknown>): boolean => isRecord(value.columns)

  const isAliasedSource = (source: unknown): boolean => {
    if (!isRecord(source)) {
      return false
    }
    if (isTableTarget(source)) {
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
        return isRecord(source.plan) && Plan.TypeId in source.plan && hasColumnRecord(source)
      case "values":
        return Array.isArray(source.rows) && hasColumnRecord(source)
      case "unnest":
        return isRecord(source.arrays) && hasColumnRecord(source)
      case "tableFunction":
        return typeof source.functionName === "string" && Array.isArray(source.args) && hasColumnRecord(source)
    }
    return false
  }

  const assertMutationTarget = (target: unknown, apiName: string): void => {
    if (!isTableTarget(target)) {
      throw new Error(`${apiName}(...) requires table targets`)
    }
  }

  const assertAliasedSource = (source: unknown, apiName: string): void => {
    if (!isAliasedSource(source)) {
      throw new Error(`${apiName}(...) requires an aliased source`)
    }
  }

  const assertMutationTargets = (
    target: unknown,
    apiName: string,
    options: { readonly allowMultiple?: boolean } = {}
  ): void => {
    const targets = Array.isArray(target) ? target : [target]
    if (targets.length === 0) {
      throw new Error(`${apiName}(...) requires at least one table target`)
    }
    if (Array.isArray(target) && targets.length === 1) {
      throw new Error(`${apiName}(...) requires a table target, not a single-element target tuple`)
    }
    for (const entry of targets) {
      assertMutationTarget(entry, apiName)
    }
    if (targets.length > 1 && options.allowMultiple !== true) {
      throw new Error(`${apiName}(...) requires a single table target`)
    }
    if (targets.length > 1 && ctx.profile.dialect !== "mysql" && ctx.profile.dialect !== "sqlite") {
      throw new Error(`${apiName}(...) only supports multiple mutation targets for mysql`)
    }
  }

  const assertUniqueTargetNames = (targets: readonly { readonly tableName: string }[]): void => {
    const seen = new Set<string>()
    for (const target of targets) {
      if (seen.has(target.tableName)) {
        throw new Error(`mutation target source names must be unique: ${target.tableName}`)
      }
      seen.add(target.tableName)
    }
  }

  const assertInsertSelectSource = (sourcePlan: any, selection: Record<string, unknown>): void => {
    const statement = ctx.getQueryState(sourcePlan).statement
    if (statement !== "select" && statement !== "set") {
      throw new Error("insert sources only accept select-like query plans")
    }
    for (const value of Object.values(selection)) {
      if (value === null || typeof value !== "object" || !(Expression.TypeId in value)) {
        throw new Error("insert sources require a flat selection object")
      }
    }
  }

  const insert = (target: any, values?: Record<string, unknown>) => {
    assertMutationTargets(target, "insert")
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
    assertInsertSelectSource(sourcePlan, selection)
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
      if (currentQuery.statement !== "insert") {
        throw new Error(`onConflict(...) is not supported for ${currentQuery.statement} statements`)
      }
      const insertTarget = currentAst.into!.source
      const conflictTarget = expectConflictClause({
        kind: "conflict",
        action: "doNothing",
        target: ctx.buildConflictTarget(insertTarget, target)
      }).target
      const updateAssignments = options.update
        ? ctx.buildMutationAssignments(insertTarget, options.update)
        : []
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
    assertMutationTargets(target, "update", { allowMultiple: true })
    const targets = ctx.mutationTargetClauses(target)
    assertUniqueTargetNames(targets)
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
    assertMutationTargets(target, "upsert")
    const { sourceName, sourceBaseName } = ctx.targetSourceDetails(target)
    const assignments = ctx.buildMutationAssignments(target, values)
    const updateAssignments = updateValues ? ctx.buildMutationAssignments(target, updateValues) : []
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
          columns: ctx.normalizeConflictColumns(target, conflictColumns) as readonly [string, ...string[]]
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
    assertMutationTargets(target, "delete", { allowMultiple: true })
    const targets = ctx.mutationTargetClauses(target)
    assertUniqueTargetNames(targets)
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
    assertMutationTargets(target, "truncate")
    const restartIdentity = normalizeStatementFlag(options.restartIdentity)
    const cascade = normalizeStatementFlag(options.cascade)
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
        restartIdentity,
        cascade
      },
      where: [],
      having: [],
      joins: [],
      groupBy: [],
      orderBy: []
    }, undefined, "write", "truncate")
  }

  const merge = (target: any, source: any, on: any, options: any = {}) => {
    assertMutationTargets(target, "merge")
    assertAliasedSource(source, "merge")
    const { sourceName: targetName, sourceBaseName: targetBaseName } = ctx.targetSourceDetails(target)
    const { sourceName: usingName, sourceBaseName: usingBaseName } = ctx.sourceDetails(source)
    if (targetName === usingName) {
      throw new Error(`merge(...) source name must differ from target source name: ${targetName}`)
    }
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
