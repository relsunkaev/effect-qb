import * as Expression from "./scalar.js"
import * as ExpressionAst from "./expression-ast.js"
import * as Plan from "./row-set.js"
import * as Table from "./table.js"
import type { PredicateFormula } from "./predicate-formula.js"
import {
  assumeFormulaTrue,
  contradictsFormula,
  guaranteedNonNullKeys,
  guaranteedNullKeys,
  guaranteedSourceNames,
  trueFormula
} from "./predicate-runtime.js"
import type { SourceLike } from "./query.js"

export interface ImplicationScope {
  readonly assumptions: PredicateFormula
  readonly nonNullKeys: ReadonlySet<string>
  readonly nullKeys: ReadonlySet<string>
  readonly requiredSourceNames: ReadonlySet<string>
  readonly absentSourceNames: ReadonlySet<string>
  readonly sourceModes: ReadonlyMap<string, Plan.SourceMode>
}

type AstBackedExpression = Expression.Any & {
  readonly [ExpressionAst.TypeId]: ExpressionAst.Any
}

export const presentFormulaOfSource = (source: Plan.Source): PredicateFormula =>
  source._presentFormula ?? trueFormula()

export const presenceWitnessesOfSource = (source: Plan.Source): ReadonlySet<string> =>
  new Set(source._presenceWitnesses ?? [])

const collectPresenceWitnesses = (
  selection: unknown,
  output: Set<string>
): void => {
  if (typeof selection !== "object" || selection === null) {
    return
  }
  if (Expression.TypeId in selection && ExpressionAst.TypeId in selection) {
    const expression = selection as unknown as AstBackedExpression
    const ast = expression[ExpressionAst.TypeId]
    if (ast.kind === "column" && expression[Expression.TypeId].nullability === "never") {
      output.add(`${ast.tableName}.${ast.columnName}`)
    }
    return
  }
  for (const value of Object.values(selection as Record<string, unknown>)) {
    collectPresenceWitnesses(value, output)
  }
}

export const presenceWitnessesOfSourceLike = (source: SourceLike): readonly string[] => {
  const output = new Set<string>()
  if (typeof source !== "object" || source === null) {
    return []
  }
  if (Table.TypeId in source) {
    collectPresenceWitnesses((source as Plan.Any)[Plan.TypeId].selection, output)
    return [...output]
  }
  if ("columns" in source) {
    collectPresenceWitnesses((source as { readonly columns: unknown }).columns, output)
  }
  return [...output]
}

const directAbsentSourceNames = (
  available: Readonly<Record<string, Plan.Source>>,
  assumptions: PredicateFormula
): Set<string> => {
  const nullKeys = guaranteedNullKeys(assumptions)
  const absent = new Set<string>()
  for (const [name, source] of Object.entries(available)) {
    if (source._presenceWitnesses?.some((key) => nullKeys.has(key))) {
      absent.add(name)
      continue
    }
    if (contradictsFormula(assumptions, presentFormulaOfSource(source))) {
      absent.add(name)
    }
  }
  return absent
}

const propagateAbsentSourceNames = (
  available: Readonly<Record<string, Plan.Source>>,
  seed: ReadonlySet<string>
): Set<string> => {
  const absent = new Set(seed)
  let changed = true
  while (changed) {
    changed = false
    for (const [name, source] of Object.entries(available)) {
      if (absent.has(name)) {
        continue
      }
      const required = guaranteedSourceNames(presentFormulaOfSource(source))
      if (Array.from(required).some((dependency) => absent.has(dependency))) {
        absent.add(name)
        changed = true
      }
    }
  }
  return absent
}

export const resolveImplicationScope = (
  available: Readonly<Record<string, Plan.Source>>,
  initialAssumptions: PredicateFormula
): ImplicationScope => {
  let assumptions = initialAssumptions
  const required = new Set<string>(
    Object.entries(available)
      .filter(([, source]) => source.mode === "required")
      .map(([name]) => name)
  )
  const appliedRequired = new Set<string>()
  let absent = new Set<string>()

  let changed = true
  while (changed) {
    changed = false

    for (const name of guaranteedSourceNames(assumptions)) {
      if (!required.has(name)) {
        required.add(name)
        changed = true
      }
    }

    for (const name of required) {
      if (absent.has(name) || appliedRequired.has(name)) {
        continue
      }
      const source = available[name]
      if (source === undefined) {
        continue
      }
      assumptions = assumeFormulaTrue(assumptions, presentFormulaOfSource(source))
      appliedRequired.add(name)
      changed = true
    }

    const nextAbsent = propagateAbsentSourceNames(available, directAbsentSourceNames(available, assumptions))
    if (nextAbsent.size !== absent.size || Array.from(nextAbsent).some((name) => !absent.has(name))) {
      absent = nextAbsent
      changed = true
    }
  }

  for (const name of absent) {
    required.delete(name)
  }

  const sourceModes = new Map<string, Plan.SourceMode>()
  for (const [name, source] of Object.entries(available)) {
    sourceModes.set(name, required.has(name) ? "required" : source.mode)
  }

  return {
    assumptions,
    nonNullKeys: guaranteedNonNullKeys(assumptions),
    nullKeys: guaranteedNullKeys(assumptions),
    requiredSourceNames: required,
    absentSourceNames: absent,
    sourceModes
  }
}
