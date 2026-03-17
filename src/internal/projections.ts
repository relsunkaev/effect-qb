import * as Expression from "../expression.ts"
import * as ProjectionAlias from "./projection-alias.ts"

/**
 * Flat projection metadata shared by renderers and executors.
 *
 * `path` identifies where a value should be decoded in the nested result row,
 * while `alias` is the flat SQL column alias used by the rendered query.
 */
export interface Projection {
  readonly path: readonly string[]
  readonly alias: string
}

/** Selection leaf paired with its resolved projection alias. */
export interface FlattenedProjection {
  readonly path: readonly string[]
  readonly expression: Expression.Any
  readonly alias: string
}

const aliasFromPath = (path: readonly string[]): string => path.join("__")

const isExpression = (value: unknown): value is Expression.Any =>
  typeof value === "object" && value !== null && Expression.TypeId in value

const projectionAliasOf = (expression: Expression.Any): string | undefined =>
  ProjectionAlias.TypeId in expression
    ? (expression as Expression.Any & {
        readonly [ProjectionAlias.TypeId]: ProjectionAlias.State
      })[ProjectionAlias.TypeId].alias
    : undefined

const pathKeyOf = (path: readonly string[]): string => JSON.stringify(path)

const formatProjectionPath = (path: readonly string[]): string => path.join(".")

const isPrefixPath = (
  left: readonly string[],
  right: readonly string[]
): boolean =>
  left.length < right.length && left.every((segment, index) => segment === right[index])

/**
 * Flattens a nested selection object into leaf expressions with decode paths
 * and resolved SQL aliases.
 */
export const flattenSelection = (
  selection: Record<string, unknown>,
  path: readonly string[] = []
): ReadonlyArray<FlattenedProjection> => {
  const fields: Array<FlattenedProjection> = []
  for (const [key, value] of Object.entries(selection)) {
    const nextPath = [...path, key]
    if (isExpression(value)) {
      fields.push({
        path: nextPath,
        expression: value,
        alias: projectionAliasOf(value) ?? aliasFromPath(nextPath)
      })
      continue
    }
    fields.push(...flattenSelection(value as Record<string, unknown>, nextPath))
  }
  return fields
}

/**
 * Validates the flattened projection set shared by renderer and executor code.
 *
 * This rejects:
 * - duplicate SQL aliases
 * - duplicate decode paths
 * - conflicting prefix paths like `profile` and `profile.id`
 */
export const validateProjections = (projections: readonly Projection[]): void => {
  const seen = new Set<string>()
  const pathKeys = new Set<string>()
  for (const projection of projections) {
    if (seen.has(projection.alias)) {
      throw new Error(`Duplicate projection alias: ${projection.alias}`)
    }
    seen.add(projection.alias)
    const pathKey = pathKeyOf(projection.path)
    if (pathKeys.has(pathKey)) {
      throw new Error(`Duplicate projection path: ${formatProjectionPath(projection.path)}`)
    }
    pathKeys.add(pathKey)
  }
  for (let index = 0; index < projections.length; index++) {
    const current = projections[index]!
    for (let compareIndex = index + 1; compareIndex < projections.length; compareIndex++) {
      const other = projections[compareIndex]!
      if (isPrefixPath(current.path, other.path) || isPrefixPath(other.path, current.path)) {
        throw new Error(
          `Conflicting projection paths: ${formatProjectionPath(current.path)} conflicts with ${formatProjectionPath(other.path)}`
        )
      }
    }
  }
}
