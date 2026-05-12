import * as Plan from "./row-set.js"
import * as Table from "./table.js"

type DslTransactionDdlRuntimeContext = {
  readonly profile: {
    readonly dialect: string
  }
  readonly makePlan: (...args: readonly any[]) => any
  readonly targetSourceDetails: (target: any) => { readonly sourceName: string; readonly sourceBaseName: string }
  readonly normalizeColumnList: (columns: string | readonly string[]) => readonly string[]
  readonly defaultIndexName: (tableName: string, columns: readonly string[], unique: boolean) => string
}

const allowedIsolationLevels = new Set(["read committed", "repeatable read", "serializable"])

export const renderTransactionIsolationLevel = (isolationLevel: unknown): string => {
  if (isolationLevel === undefined) {
    return ""
  }
  if (typeof isolationLevel !== "string" || !allowedIsolationLevels.has(isolationLevel)) {
    throw new Error("Unsupported transaction isolation level")
  }
  return `isolation level ${isolationLevel}`
}

export const expectDdlClauseKind = <
  Ddl extends { readonly kind: string },
  Kind extends Ddl["kind"]
>(
  ddl: Ddl | undefined,
  kind: Kind
): Extract<Ddl, { readonly kind: Kind }> => {
  if (ddl === undefined || ddl.kind !== kind) {
    throw new Error("Unsupported DDL statement kind")
  }
  return ddl as Extract<Ddl, { readonly kind: Kind }>
}

const validateIsolationLevel = (isolationLevel: unknown): void => {
  renderTransactionIsolationLevel(isolationLevel)
}

export const makeDslTransactionDdlRuntime = (ctx: DslTransactionDdlRuntimeContext) => {
  const validateIndexColumns = (target: any, columns: readonly string[]): void => {
    const fields = target[Table.TypeId]?.fields as Record<string, unknown> | undefined
    if (fields === undefined) {
      return
    }
    for (const columnName of columns) {
      if (!(columnName in fields)) {
        throw new Error(`effect-qb: unknown index column '${columnName}'`)
      }
    }
  }

  const transaction = (options: { readonly isolationLevel?: any; readonly readOnly?: boolean } = {}) => {
    validateIsolationLevel(options.isolationLevel)
    return ctx.makePlan({
      selection: {},
      required: [],
      available: {},
      dialect: ctx.profile.dialect
    }, {
      kind: "transaction",
      select: {},
      transaction: {
        kind: "transaction",
        isolationLevel: options.isolationLevel,
        readOnly: options.readOnly
      },
      where: [],
      having: [],
      joins: [],
      groupBy: [],
      orderBy: []
    }, undefined, "transaction", "transaction")
  }

  const commit = () =>
    ctx.makePlan({
      selection: {},
      required: [],
      available: {},
      dialect: ctx.profile.dialect
    }, {
      kind: "commit",
      select: {},
      transaction: {
        kind: "commit"
      },
      where: [],
      having: [],
      joins: [],
      groupBy: [],
      orderBy: []
    }, undefined, "transaction", "commit")

  const rollback = () =>
    ctx.makePlan({
      selection: {},
      required: [],
      available: {},
      dialect: ctx.profile.dialect
    }, {
      kind: "rollback",
      select: {},
      transaction: {
        kind: "rollback"
      },
      where: [],
      having: [],
      joins: [],
      groupBy: [],
      orderBy: []
    }, undefined, "transaction", "rollback")

  const savepoint = (name: string) =>
    ctx.makePlan({
      selection: {},
      required: [],
      available: {},
      dialect: ctx.profile.dialect
    }, {
      kind: "savepoint",
      select: {},
      transaction: {
        kind: "savepoint",
        name
      },
      where: [],
      having: [],
      joins: [],
      groupBy: [],
      orderBy: []
    }, undefined, "transaction", "savepoint")

  const rollbackTo = (name: string) =>
    ctx.makePlan({
      selection: {},
      required: [],
      available: {},
      dialect: ctx.profile.dialect
    }, {
      kind: "rollbackTo",
      select: {},
      transaction: {
        kind: "rollbackTo",
        name
      },
      where: [],
      having: [],
      joins: [],
      groupBy: [],
      orderBy: []
    }, undefined, "transaction", "rollbackTo")

  const releaseSavepoint = (name: string) =>
    ctx.makePlan({
      selection: {},
      required: [],
      available: {},
      dialect: ctx.profile.dialect
    }, {
      kind: "releaseSavepoint",
      select: {},
      transaction: {
        kind: "releaseSavepoint",
        name
      },
      where: [],
      having: [],
      joins: [],
      groupBy: [],
      orderBy: []
    }, undefined, "transaction", "releaseSavepoint")

  const createTable = (target: any, options: { readonly ifNotExists?: boolean } = {}) => {
    const { sourceName, sourceBaseName } = ctx.targetSourceDetails(target)
    return ctx.makePlan({
      selection: {},
      required: [],
      available: {},
      dialect: target[Plan.TypeId].dialect
    }, {
      kind: "createTable",
      select: {},
      target: {
        kind: "from",
        tableName: sourceName,
        baseTableName: sourceBaseName,
        source: target
      },
      ddl: {
        kind: "createTable",
        ifNotExists: options.ifNotExists ?? false
      },
      where: [],
      having: [],
      joins: [],
      groupBy: [],
      orderBy: []
    }, undefined, "ddl", "createTable")
  }

  const dropTable = (target: any, options: { readonly ifExists?: boolean } = {}) => {
    const { sourceName, sourceBaseName } = ctx.targetSourceDetails(target)
    return ctx.makePlan({
      selection: {},
      required: [],
      available: {},
      dialect: target[Plan.TypeId].dialect
    }, {
      kind: "dropTable",
      select: {},
      target: {
        kind: "from",
        tableName: sourceName,
        baseTableName: sourceBaseName,
        source: target
      },
      ddl: {
        kind: "dropTable",
        ifExists: options.ifExists ?? false
      },
      where: [],
      having: [],
      joins: [],
      groupBy: [],
      orderBy: []
    }, undefined, "ddl", "dropTable")
  }

  const createIndex = (target: any, columns: string | readonly string[], options: { readonly name?: string; readonly unique?: boolean; readonly ifNotExists?: boolean } = {}) => {
    const normalizedColumns = ctx.normalizeColumnList(columns)
    validateIndexColumns(target, normalizedColumns)
    const { sourceName, sourceBaseName } = ctx.targetSourceDetails(target)
    return ctx.makePlan({
      selection: {},
      required: [],
      available: {},
      dialect: target[Plan.TypeId].dialect
    }, {
      kind: "createIndex",
      select: {},
      target: {
        kind: "from",
        tableName: sourceName,
        baseTableName: sourceBaseName,
        source: target
      },
      ddl: {
        kind: "createIndex",
        name: options.name ?? ctx.defaultIndexName(sourceBaseName, normalizedColumns, options.unique ?? false),
        columns: normalizedColumns,
        unique: options.unique ?? false,
        ifNotExists: options.ifNotExists ?? false
      },
      where: [],
      having: [],
      joins: [],
      groupBy: [],
      orderBy: []
    }, undefined, "ddl", "createIndex")
  }

  const dropIndex = (target: any, columns: string | readonly string[], options: { readonly name?: string; readonly ifExists?: boolean } = {}) => {
    const normalizedColumns = ctx.normalizeColumnList(columns)
    validateIndexColumns(target, normalizedColumns)
    const { sourceName, sourceBaseName } = ctx.targetSourceDetails(target)
    return ctx.makePlan({
      selection: {},
      required: [],
      available: {},
      dialect: target[Plan.TypeId].dialect
    }, {
      kind: "dropIndex",
      select: {},
      target: {
        kind: "from",
        tableName: sourceName,
        baseTableName: sourceBaseName,
        source: target
      },
      ddl: {
        kind: "dropIndex",
        name: options.name ?? ctx.defaultIndexName(sourceBaseName, normalizedColumns, false),
        ifExists: options.ifExists ?? false
      },
      where: [],
      having: [],
      joins: [],
      groupBy: [],
      orderBy: []
    }, undefined, "ddl", "dropIndex")
  }

  return {
    transaction,
    commit,
    rollback,
    savepoint,
    rollbackTo,
    releaseSavepoint,
    createTable,
    dropTable,
    createIndex,
    dropIndex
  }
}
