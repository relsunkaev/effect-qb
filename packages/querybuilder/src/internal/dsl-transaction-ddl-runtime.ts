import * as Plan from "./row-set.js"

type DslTransactionDdlRuntimeContext = {
  readonly profile: {
    readonly dialect: string
  }
  readonly makePlan: (...args: readonly any[]) => any
  readonly targetSourceDetails: (target: any) => { readonly sourceName: string; readonly sourceBaseName: string }
  readonly normalizeColumnList: (columns: string | readonly string[]) => readonly string[]
  readonly defaultIndexName: (tableName: string, columns: readonly string[], unique: boolean) => string
}

export const renderTransactionIsolationLevel = (
  isolationLevel: unknown
): string => {
  if (isolationLevel === undefined) {
    return ""
  }
  return `isolation level ${isolationLevel as string}`
}

export const expectDdlClauseKind = <
  Ddl extends { readonly kind: string },
  Kind extends Ddl["kind"]
>(
  ddl: Ddl | undefined,
  _kind: Kind
): Extract<Ddl, { readonly kind: Kind }> =>
  ddl as Extract<Ddl, { readonly kind: Kind }>

export const expectTruncateClause = <
  Truncate extends { readonly kind: string }
>(
  truncate: Truncate | undefined
): Extract<Truncate, { readonly kind: "truncate" }> =>
  truncate as Extract<Truncate, { readonly kind: "truncate" }>

export const normalizeStatementFlag = (value: unknown): boolean =>
  (value as boolean | undefined) ?? false

export const normalizeStatementIdentifier = (
  _apiName: string,
  _identifierName: string,
  value: unknown
): string =>
  value as string

export const makeDslTransactionDdlRuntime = (ctx: DslTransactionDdlRuntimeContext) => {
  const transaction = (options: { readonly isolationLevel?: any; readonly readOnly?: boolean } = {}) => {
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

  const savepoint = (name: string) => {
    return ctx.makePlan({
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
  }

  const rollbackTo = (name: string) => {
    return ctx.makePlan({
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
  }

  const releaseSavepoint = (name: string) => {
    return ctx.makePlan({
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
  }

  const createTable = (target: any, options: { readonly ifNotExists?: boolean } = {}) => {
    const ifNotExists = normalizeStatementFlag(options.ifNotExists)
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
        ifNotExists
      },
      where: [],
      having: [],
      joins: [],
      groupBy: [],
      orderBy: []
    }, undefined, "ddl", "createTable")
  }

  const dropTable = (target: any, options: { readonly ifExists?: boolean } = {}) => {
    const ifExists = normalizeStatementFlag(options.ifExists)
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
        ifExists
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
    const unique = normalizeStatementFlag(options.unique)
    const ifNotExists = normalizeStatementFlag(options.ifNotExists)
    const name = options.name
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
        name: name ?? ctx.defaultIndexName(sourceBaseName, normalizedColumns, unique),
        columns: normalizedColumns,
        unique,
        ifNotExists
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
    const ifExists = normalizeStatementFlag(options.ifExists)
    const name = options.name
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
        name: name ?? ctx.defaultIndexName(sourceBaseName, normalizedColumns, false),
        ifExists
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
