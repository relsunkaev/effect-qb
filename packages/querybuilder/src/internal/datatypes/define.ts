import type * as Expression from "../scalar.js"
import type { DatatypeFamilySpec, DatatypeKindSpec } from "./shape.js"

type DatatypeWitness<
  Dialect extends string,
  Kinds extends Record<string, DatatypeKindSpec>,
  Families extends Record<string, DatatypeFamilySpec>,
  Kind extends keyof Kinds & string
> = Expression.DbType.Base<Dialect, Kind> & {
  readonly family: Kinds[Kind]["family"]
  readonly runtime: Kinds[Kind]["runtime"]
  readonly compareGroup: Families[Kinds[Kind]["family"]]["compareGroup"]
  readonly castTargets: Families[Kinds[Kind]["family"]]["castTargets"]
  readonly traits: Families[Kinds[Kind]["family"]]["traits"]
}

export type DatatypeModule<
  Dialect extends string,
  Kinds extends Record<string, DatatypeKindSpec>,
  Families extends Record<string, DatatypeFamilySpec>,
  Aliases extends Record<string, string> = Record<never, never>
> = {
  readonly custom: <Kind extends string>(kind: Kind) => Expression.DbType.Base<Dialect, Kind>
} & {
  readonly [Kind in keyof Kinds]: () => DatatypeWitness<Dialect, Kinds, Families, Kind & string>
} & {
  readonly [Alias in keyof Aliases]: () => DatatypeWitness<Dialect, Kinds, Families, Aliases[Alias] & keyof Kinds & string>
}
