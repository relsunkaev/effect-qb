import type * as Expression from "../scalar.js"
import type { NonEmptyStringInput } from "../table-options.js"
import type { DatatypeFamilySpec, DatatypeKindSpec } from "./shape.js"

type ImplicitTargetsOf<Family> = Family extends { readonly implicitTargets: infer Targets extends readonly string[] }
  ? Targets
  : readonly []

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
  readonly implicitTargets: ImplicitTargetsOf<Families[Kinds[Kind]["family"]]>
  readonly traits: Families[Kinds[Kind]["family"]]["traits"]
}

export type DatatypeModule<
  Dialect extends string,
  Kinds extends Record<string, DatatypeKindSpec>,
  Families extends Record<string, DatatypeFamilySpec>,
  Aliases extends Record<string, string> = Record<never, never>
> = {
  readonly custom: <Kind extends string>(kind: NonEmptyStringInput<Kind>) => Expression.DbType.Base<Dialect, Kind>
} & {
  readonly [Kind in keyof Kinds]: () => DatatypeWitness<Dialect, Kinds, Families, Kind & string>
} & {
  readonly [Alias in keyof Aliases]: () => DatatypeWitness<Dialect, Kinds, Families, Aliases[Alias] & keyof Kinds & string>
}

/** Materialize the existing kind/family contract without adding dialect policy. */
export const makeDatatypeModule = <
  const Dialect extends string,
  const Kinds extends Record<string, DatatypeKindSpec>,
  const Families extends Record<string, DatatypeFamilySpec>
>(dialect: Dialect, kinds: Kinds, families: Families): DatatypeModule<Dialect, Kinds, Families> => {
  const module: Record<string, (...args: any[]) => Expression.DbType.Base<Dialect, string>> = {
    custom: (kind: string) => ({ dialect, kind })
  }
  for (const [kind, spec] of Object.entries(kinds)) {
    const family = families[spec.family]
    module[kind] = () => ({
      dialect,
      kind,
      family: spec.family,
      runtime: spec.runtime,
      compareGroup: family?.compareGroup,
      castTargets: family?.castTargets,
      implicitTargets: family?.implicitTargets,
      traits: family?.traits
    })
  }
  return module as DatatypeModule<Dialect, Kinds, Families>
}
