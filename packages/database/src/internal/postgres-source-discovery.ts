import { randomUUID } from "node:crypto"
import { rm } from "node:fs/promises"
import { basename, dirname, extname, join, relative, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import ts from "typescript"

import {
  enumKey,
  fromDiscoveredValues,
  isEnumDefinition,
  isTableDefinition,
  tableKey,
  type SchemaModel
} from "effect-qb/postgres/metadata"
import { Table } from "effect-qb/postgres"

type DiscoveryImportInfo = {
  readonly postgresModules: Set<string>
  readonly postgresNamespaceAliases: Set<string>
  readonly tableAliases: Set<string>
  readonly schemaAliases: Set<string>
}

export type SourceDeclaration =
  | {
      readonly kind: "tableFactory"
      readonly filePath: string
      readonly identifier: string
      readonly start: number
      readonly end: number
    }
  | {
      readonly kind: "tableSchema"
      readonly filePath: string
      readonly identifier: string
      readonly start: number
      readonly end: number
      readonly schemaBuilderIdentifier: string
    }
  | {
      readonly kind: "tableClass"
      readonly filePath: string
      readonly identifier: string
      readonly start: number
      readonly end: number
    }
  | {
      readonly kind: "enumFactory"
      readonly filePath: string
      readonly identifier: string
      readonly start: number
      readonly end: number
    }
  | {
      readonly kind: "enumSchema"
      readonly filePath: string
      readonly identifier: string
      readonly start: number
      readonly end: number
      readonly schemaBuilderIdentifier: string
    }

export interface DiscoveredSourceSchema {
  readonly declarations: readonly SourceDeclaration[]
  readonly bindings: readonly SourceBinding[]
  readonly model: SchemaModel
}

export interface SourceBinding {
  readonly declaration: SourceDeclaration
  readonly value: unknown
  readonly key: string
  readonly kind: "table" | "enum"
}

const DEFAULT_SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mts",
  ".cts",
  ".mjs",
  ".cjs"
])

const isPostgresModule = (value: string): boolean =>
  value === "effect-qb/postgres" || value === "#postgres" || value.endsWith("/postgres")

const isSchemaCall = (
  expression: ts.Expression,
  importInfo: DiscoveryImportInfo
): boolean => {
  if (!ts.isCallExpression(expression)) {
    return false
  }
  if (ts.isIdentifier(expression.expression)) {
    return importInfo.schemaAliases.has(expression.expression.text)
  }
  if (!ts.isPropertyAccessExpression(expression.expression)) {
    return false
  }
  const target = expression.expression
  if (target.name.text !== "schema") {
    return false
  }
  if (ts.isIdentifier(target.expression)) {
    return importInfo.postgresNamespaceAliases.has(target.expression.text)
  }
  return false
}

const unwrapPipeRoot = (expression: ts.Expression): ts.Expression => {
  let current = expression
  while (ts.isCallExpression(current) && ts.isPropertyAccessExpression(current.expression) && current.expression.name.text === "pipe") {
    current = current.expression.expression
  }
  return current
}

const isTableMakeRoot = (
  expression: ts.Expression,
  importInfo: DiscoveryImportInfo
): boolean => {
  const root = unwrapPipeRoot(expression)
  if (!ts.isCallExpression(root) || !ts.isPropertyAccessExpression(root.expression)) {
    return false
  }
  const target = root.expression
  if (target.name.text !== "make") {
    return false
  }
  if (ts.isIdentifier(target.expression)) {
    return importInfo.tableAliases.has(target.expression.text)
  }
  return ts.isPropertyAccessExpression(target.expression)
    && ts.isIdentifier(target.expression.expression)
    && importInfo.postgresNamespaceAliases.has(target.expression.expression.text)
    && target.expression.name.text === "Table"
}

const isSchemaTableRoot = (
  expression: ts.Expression,
  schemaBuilders: Set<string>
): string | undefined => {
  const root = unwrapPipeRoot(expression)
  if (!ts.isCallExpression(root) || !ts.isPropertyAccessExpression(root.expression)) {
    return undefined
  }
  const target = root.expression
  if (target.name.text !== "table" || !ts.isIdentifier(target.expression)) {
    return undefined
  }
  return schemaBuilders.has(target.expression.text)
    ? target.expression.text
    : undefined
}

const isEnumFactoryRoot = (
  expression: ts.Expression,
  importInfo: DiscoveryImportInfo
): boolean => {
  if (!ts.isCallExpression(expression) || !ts.isPropertyAccessExpression(expression.expression)) {
    return false
  }
  const target = expression.expression
  if (target.name.text !== "enum") {
    return false
  }
  if (isSchemaCall(target.expression, importInfo)) {
    return true
  }
  return ts.isIdentifier(target.expression)
    && importInfo.postgresNamespaceAliases.has(target.expression.text)
}

const isSchemaEnumRoot = (
  expression: ts.Expression,
  schemaBuilders: Set<string>
): string | undefined => {
  if (!ts.isCallExpression(expression) || !ts.isPropertyAccessExpression(expression.expression)) {
    return undefined
  }
  const target = expression.expression
  if (target.name.text !== "enum" || !ts.isIdentifier(target.expression)) {
    return undefined
  }
  return schemaBuilders.has(target.expression.text)
    ? target.expression.text
    : undefined
}

const isTableClass = (
  declaration: ts.ClassDeclaration,
  importInfo: DiscoveryImportInfo
): boolean => {
  const heritage = declaration.heritageClauses?.find((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword)
  const type = heritage?.types[0]
  if (type === undefined) {
    return false
  }
  let expression: ts.Expression = type.expression
  if (ts.isCallExpression(expression)) {
    expression = expression.expression
  }
  if (!ts.isCallExpression(expression) || !ts.isPropertyAccessExpression(expression.expression)) {
    return false
  }
  const target = expression.expression
  if (target.name.text !== "Class") {
    return false
  }
  if (ts.isIdentifier(target.expression)) {
    return importInfo.tableAliases.has(target.expression.text)
  }
  return ts.isPropertyAccessExpression(target.expression)
    && ts.isIdentifier(target.expression.expression)
    && importInfo.postgresNamespaceAliases.has(target.expression.expression.text)
    && target.expression.name.text === "Table"
}

const isTableClassReference = (
  expression: ts.Expression,
  importInfo: DiscoveryImportInfo
): boolean => {
  let current: ts.Expression = expression
  if (ts.isCallExpression(current)) {
    current = current.expression
  }
  if (!ts.isCallExpression(current) || !ts.isPropertyAccessExpression(current.expression)) {
    return false
  }
  const target = current.expression
  if (target.name.text !== "Class") {
    return false
  }
  if (ts.isIdentifier(target.expression)) {
    return importInfo.tableAliases.has(target.expression.text)
  }
  return ts.isPropertyAccessExpression(target.expression)
    && ts.isIdentifier(target.expression.expression)
    && importInfo.postgresNamespaceAliases.has(target.expression.expression.text)
    && target.expression.name.text === "Table"
}

const expressionContainsDiscoveryConstruct = (
  expression: ts.Expression,
  importInfo: DiscoveryImportInfo,
  schemaBuilders: ReadonlySet<string>
): boolean => {
  let found = false
  const knownSchemaBuilders = new Set(schemaBuilders)
  const visit = (node: ts.Node): void => {
    if (found) {
      return
    }
    if (ts.isExpression(node) && (
      isSchemaCall(node, importInfo) ||
      isTableMakeRoot(node, importInfo) ||
      isEnumFactoryRoot(node, importInfo) ||
      isTableClassReference(node, importInfo) ||
      isSchemaTableRoot(node, knownSchemaBuilders) !== undefined ||
      isSchemaEnumRoot(node, knownSchemaBuilders) !== undefined
    )) {
      found = true
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(expression)
  return found
}

const statementContainsDiscoveryConstruct = (
  statement: ts.Statement,
  importInfo: DiscoveryImportInfo,
  schemaBuilders: ReadonlySet<string>
): boolean => {
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations.some((declaration) =>
      declaration.initializer !== undefined
      && expressionContainsDiscoveryConstruct(declaration.initializer, importInfo, schemaBuilders)
    )
  }
  if (ts.isClassDeclaration(statement)) {
    return statement.heritageClauses?.some((clause) =>
      clause.types.some((type) => expressionContainsDiscoveryConstruct(type.expression, importInfo, schemaBuilders))
    ) ?? false
  }
  return false
}

const validateNestedDiscoveryStatements = (
  sourceFile: ts.SourceFile,
  filePath: string,
  importInfo: DiscoveryImportInfo,
  schemaBuilders: ReadonlySet<string>
): void => {
  const visit = (node: ts.Node): void => {
    if (
      (ts.isVariableStatement(node) || ts.isClassDeclaration(node))
      && statementContainsDiscoveryConstruct(node, importInfo, schemaBuilders)
    ) {
      throw new Error(`Nested schema declarations are not supported in '${filePath}'`)
    }
    ts.forEachChild(node, visit)
  }
  for (const statement of sourceFile.statements) {
    ts.forEachChild(statement, visit)
  }
}

const collectImportInfo = (sourceFile: ts.SourceFile): DiscoveryImportInfo => {
  const postgresModules = new Set<string>()
  const postgresNamespaceAliases = new Set<string>()
  const tableAliases = new Set<string>()
  const schemaAliases = new Set<string>()
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || statement.importClause === undefined) {
      continue
    }
    const moduleSpecifier = ts.isStringLiteral(statement.moduleSpecifier)
      ? statement.moduleSpecifier.text
      : undefined
    if (moduleSpecifier === undefined || !isPostgresModule(moduleSpecifier)) {
      continue
    }
    postgresModules.add(moduleSpecifier)
    const bindings = statement.importClause.namedBindings
    if (bindings === undefined) {
      continue
    }
    if (ts.isNamespaceImport(bindings)) {
      postgresNamespaceAliases.add(bindings.name.text)
      continue
    }
    for (const element of bindings.elements) {
      const imported = element.propertyName?.text ?? element.name.text
      if (imported === "Table") {
        tableAliases.add(element.name.text)
      } else if (imported === "schema") {
        schemaAliases.add(element.name.text)
      }
    }
  }
  return {
    postgresModules,
    postgresNamespaceAliases,
    tableAliases,
    schemaAliases
  }
}

const discoverInFile = (
  filePath: string,
  contents: string
): readonly SourceDeclaration[] => {
  const sourceFile = ts.createSourceFile(filePath, contents, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const importInfo = collectImportInfo(sourceFile)
  if (importInfo.postgresModules.size === 0 && importInfo.postgresNamespaceAliases.size === 0 && importInfo.tableAliases.size === 0 && importInfo.schemaAliases.size === 0) {
    return []
  }
  const schemaBuilders = new Set<string>()
  const declarations: SourceDeclaration[] = []
  for (const statement of sourceFile.statements) {
    if (ts.isVariableStatement(statement)) {
      if (statement.declarationList.declarations.length !== 1) {
        if (statementContainsDiscoveryConstruct(statement, importInfo, schemaBuilders)) {
          throw new Error(`Non-canonical schema declaration in '${filePath}'`)
        }
        continue
      }
      const declaration = statement.declarationList.declarations[0]!
      if (!ts.isIdentifier(declaration.name) || declaration.initializer === undefined) {
        if (statementContainsDiscoveryConstruct(statement, importInfo, schemaBuilders)) {
          throw new Error(`Non-canonical schema declaration in '${filePath}'`)
        }
        continue
      }
      const identifier = declaration.name.text
      if (isSchemaCall(declaration.initializer, importInfo)) {
        schemaBuilders.add(identifier)
        continue
      }
      if (isTableMakeRoot(declaration.initializer, importInfo)) {
        declarations.push({
          kind: "tableFactory",
          filePath,
          identifier,
          start: statement.getStart(sourceFile),
          end: statement.getEnd(),
        })
        continue
      }
      const schemaBuilderIdentifier = isSchemaTableRoot(declaration.initializer, schemaBuilders)
      if (schemaBuilderIdentifier !== undefined) {
        declarations.push({
          kind: "tableSchema",
          filePath,
          identifier,
          start: statement.getStart(sourceFile),
          end: statement.getEnd(),
          schemaBuilderIdentifier
        })
        continue
      }
      if (isEnumFactoryRoot(declaration.initializer, importInfo)) {
        declarations.push({
          kind: "enumFactory",
          filePath,
          identifier,
          start: statement.getStart(sourceFile),
          end: statement.getEnd()
        })
        continue
      }
      const enumSchemaBuilderIdentifier = isSchemaEnumRoot(declaration.initializer, schemaBuilders)
      if (enumSchemaBuilderIdentifier !== undefined) {
        declarations.push({
          kind: "enumSchema",
          filePath,
          identifier,
          start: statement.getStart(sourceFile),
          end: statement.getEnd(),
          schemaBuilderIdentifier: enumSchemaBuilderIdentifier
        })
        continue
      }
      if (expressionContainsDiscoveryConstruct(declaration.initializer, importInfo, schemaBuilders)) {
        throw new Error(`Non-canonical schema declaration '${identifier}' in '${filePath}'`)
      }
      continue
    }
    if (ts.isClassDeclaration(statement)) {
      if (statement.name && isTableClass(statement, importInfo)) {
        declarations.push({
          kind: "tableClass",
          filePath,
          identifier: statement.name.text,
          start: statement.getStart(sourceFile),
          end: statement.getEnd()
        })
        continue
      }
      if (statementContainsDiscoveryConstruct(statement, importInfo, schemaBuilders)) {
        throw new Error(`Non-canonical schema declaration in '${filePath}'`)
      }
    }
  }
  validateNestedDiscoveryStatements(sourceFile, filePath, importInfo, schemaBuilders)
  return declarations
}

const createTemporaryExportModule = async (
  filePath: string,
  names: readonly string[]
): Promise<string> => {
  const extension = extname(filePath) || ".ts"
  const tempPath = join(dirname(filePath), `.__effect_qb_discovery_${basename(filePath, extension)}_${randomUUID()}${extension}`)
  const contents = await Bun.file(filePath).text()
  await Bun.write(
    tempPath,
    `${contents}\nconst __effect_qb_discovery_exports = { ${names.join(", ")} }\nexport default __effect_qb_discovery_exports\n`
  )
  return tempPath
}

const importDiscoveredValues = async (
  declarations: readonly SourceDeclaration[]
): Promise<ReadonlyArray<unknown>> => {
  const byFile = new Map<string, string[]>()
  for (const declaration of declarations) {
    const names = byFile.get(declaration.filePath) ?? []
    names.push(declaration.identifier)
    byFile.set(declaration.filePath, names)
  }
  const values: unknown[] = []
  for (const [filePath, names] of byFile) {
    const tempPath = await createTemporaryExportModule(filePath, [...new Set(names)])
    try {
      const imported = await import(pathToFileURL(tempPath).href)
      const exportedValues = imported.default as Record<string, unknown> | undefined
      for (const name of names) {
        values.push(exportedValues?.[name])
      }
    } finally {
      await rm(tempPath, { force: true }).catch(() => undefined)
    }
  }
  return values
}

const scanPattern = async (
  cwd: string,
  pattern: string
): Promise<ReadonlyArray<string>> => {
  const matches: string[] = []
  for await (const match of new Bun.Glob(pattern).scan({ cwd, absolute: true, dot: true, followSymlinks: true })) {
    if (DEFAULT_SOURCE_EXTENSIONS.has(extname(match))) {
      matches.push(resolve(match))
    }
  }
  return matches
}

export const discoverSourceSchema = async (
  cwd: string,
  source: {
    readonly include: readonly string[]
    readonly exclude?: readonly string[]
  }
): Promise<DiscoveredSourceSchema> => {
  const included = new Set<string>()
  for (const pattern of source.include) {
    for (const match of await scanPattern(cwd, pattern)) {
      included.add(match)
    }
  }
  const excluded = new Set<string>()
  for (const pattern of source.exclude ?? []) {
    for (const match of await scanPattern(cwd, pattern)) {
      excluded.add(match)
    }
  }
  const declarations: SourceDeclaration[] = []
  for (const filePath of [...included].filter((file) => !excluded.has(file)).sort()) {
    const contents = await Bun.file(filePath).text()
    declarations.push(...discoverInFile(filePath, contents))
  }
  const duplicateKeys = new Map<string, string>()
  for (const declaration of declarations) {
    const key = `${declaration.filePath}:${declaration.identifier}`
    if (duplicateKeys.has(key)) {
      throw new Error(`Duplicate discovered declaration '${declaration.identifier}' in '${relative(cwd, declaration.filePath)}'`)
    }
    duplicateKeys.set(key, key)
  }
  const values = await importDiscoveredValues(declarations)
  const bindings: SourceBinding[] = []
  const seenKeys = new Map<string, SourceDeclaration>()
  for (const [index, value] of values.entries()) {
    const declaration = declarations[index]
    if (declaration === undefined) {
      continue
    }
    if (isTableDefinition(value)) {
      const state = (value as any)[Table.TypeId] as {
        readonly schemaName?: string
        readonly baseName: string
      }
      const key = tableKey(state.schemaName, state.baseName)
      const existing = seenKeys.get(key)
      if (existing) {
        throw new Error(
          `Duplicate discovered table identity '${key}' in '${relative(cwd, existing.filePath)}' and '${relative(cwd, declaration.filePath)}'`
        )
      }
      seenKeys.set(key, declaration)
      bindings.push({
        declaration,
        value,
        key,
        kind: "table"
      })
      continue
    }
    if (isEnumDefinition(value)) {
      const key = enumKey(value.schemaName, value.name)
      const existing = seenKeys.get(key)
      if (existing) {
        throw new Error(
          `Duplicate discovered enum identity '${key}' in '${relative(cwd, existing.filePath)}' and '${relative(cwd, declaration.filePath)}'`
        )
      }
      seenKeys.set(key, declaration)
      bindings.push({
        declaration,
        value,
        key,
        kind: "enum"
      })
    }
  }
  return {
    declarations,
    bindings,
    model: fromDiscoveredValues(values)
  }
}
