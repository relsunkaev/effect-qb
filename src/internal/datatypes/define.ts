import type * as Expression from "../../expression.ts"
import type { DatatypeKindSpec } from "./shape.ts"

export type DatatypeModule<
  Dialect extends string,
  Kinds extends Record<string, DatatypeKindSpec>,
  Aliases extends Record<string, string> = Record<never, never>
> = {
  readonly custom: <Kind extends string>(kind: Kind) => Expression.DbType.Base<Dialect, Kind>
} & {
  readonly [Kind in keyof Kinds]: () => Expression.DbType.Base<Dialect, Kind & string>
} & {
  readonly [Alias in keyof Aliases]: () => Expression.DbType.Base<Dialect, Aliases[Alias] & string>
}

export const makeDatatypeModule = <
  Dialect extends string,
  Kinds extends Record<string, DatatypeKindSpec>,
  Aliases extends Record<string, string> = Record<never, never>
>(
  dialect: Dialect,
  kinds: Kinds,
  aliases?: Aliases
): DatatypeModule<Dialect, Kinds, Aliases> => {
  const module: Record<string, (...args: readonly any[]) => Expression.DbType.Base<Dialect, string>> = {
    custom: (kind: string) => ({
      dialect,
      kind
    })
  }
  for (const kind of Object.keys(kinds)) {
    module[kind] = () => ({
      dialect,
      kind
    })
  }
  for (const [alias, kind] of Object.entries(aliases ?? {})) {
    module[alias] = () => ({
      dialect,
      kind
    })
  }
  return module as DatatypeModule<Dialect, Kinds, Aliases>
}
