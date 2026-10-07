import { makeRuntimePlan } from "./plan.js"
import * as Plan from "../row-set.js"

type DslTransactionDdlRuntimeContext = {
  readonly profile: {
    readonly dialect: string
  }
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
    return makeRuntimePlan({
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
      }
    }, {
      capabilities: "transaction",
      statement: "transaction"
    })
  }

  const commit = () =>
    makeRuntimePlan({
      selection: {},
      required: [],
      available: {},
      dialect: ctx.profile.dialect
    }, {
      kind: "commit",
      select: {},
      transaction: {
        kind: "commit"
      }
    }, {
      capabilities: "transaction",
      statement: "commit"
    })

  const rollback = () =>
    makeRuntimePlan({
      selection: {},
      required: [],
      available: {},
      dialect: ctx.profile.dialect
    }, {
      kind: "rollback",
      select: {},
      transaction: {
        kind: "rollback"
      }
    }, {
      capabilities: "transaction",
      statement: "rollback"
    })

  const savepoint = (name: string) => {
    return makeRuntimePlan({
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
      }
    }, {
      capabilities: "transaction",
      statement: "savepoint"
    })
  }

  const rollbackTo = (name: string) => {
    return makeRuntimePlan({
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
      }
    }, {
      capabilities: "transaction",
      statement: "rollbackTo"
    })
  }

  const releaseSavepoint = (name: string) => {
    return makeRuntimePlan({
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
      }
    }, {
      capabilities: "transaction",
      statement: "releaseSavepoint"
    })
  }

  const createTable = (target: any, options: { readonly ifNotExists?: boolean } = {}) => {
    const ifNotExists = normalizeStatementFlag(options.ifNotExists)
    const { sourceName, sourceBaseName } = ctx.targetSourceDetails(target)
    return makeRuntimePlan({
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
      }
    }, {
      capabilities: "ddl",
      statement: "createTable"
    })
  }

  const dropTable = (target: any, options: { readonly ifExists?: boolean } = {}) => {
    const ifExists = normalizeStatementFlag(options.ifExists)
    const { sourceName, sourceBaseName } = ctx.targetSourceDetails(target)
    return makeRuntimePlan({
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
      }
    }, {
      capabilities: "ddl",
      statement: "dropTable"
    })
  }

  const createIndex = (target: any, columns: string | readonly string[], options: { readonly name?: string; readonly unique?: boolean; readonly ifNotExists?: boolean } = {}) => {
    const normalizedColumns = ctx.normalizeColumnList(columns)
    const unique = normalizeStatementFlag(options.unique)
    const ifNotExists = normalizeStatementFlag(options.ifNotExists)
    const name = options.name
    const { sourceName, sourceBaseName } = ctx.targetSourceDetails(target)
    return makeRuntimePlan({
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
        columns: normalizedColumns as readonly [string, ...string[]],
        unique,
        ifNotExists
      }
    }, {
      capabilities: "ddl",
      statement: "createIndex"
    })
  }

  const dropIndex = (target: any, columns: string | readonly string[], options: { readonly name?: string; readonly ifExists?: boolean } = {}) => {
    const normalizedColumns = ctx.normalizeColumnList(columns)
    const ifExists = normalizeStatementFlag(options.ifExists)
    const name = options.name
    const { sourceName, sourceBaseName } = ctx.targetSourceDetails(target)
    return makeRuntimePlan({
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
      }
    }, {
      capabilities: "ddl",
      statement: "dropIndex"
    })
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
