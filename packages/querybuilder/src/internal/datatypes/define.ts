import type * as Expression from ".././expression.js"
import type { DatatypeKindSpec } from "./shape.js"

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
