import * as Expression from "../scalar.js"
import * as ExpressionAst from "../expression-ast.js"
import type { PredicateAtom } from "./atom.js"
import type {
  EqColumnAtom,
  EqLiteralAtom,
  NeqLiteralAtom,
  NonNullAtom,
  NullAtom,
  UnknownAtom
} from "./atom.js"
import type {
  AllFormula,
  AnyFormula,
  AtomFormula,
  FalseFormula,
  NotFormula,
  PredicateFormula,
  TrueFormula
} from "./formula.js"

export interface RuntimeContext {
  readonly nonNullKeys: ReadonlySet<string>
  readonly nullKeys: ReadonlySet<string>
  readonly eqLiterals: ReadonlyMap<string, string>
  readonly neqLiterals: ReadonlyMap<string, ReadonlySet<string>>
  readonly sourceNames: ReadonlySet<string>
  readonly contradiction: boolean
  readonly unknown: boolean
}

type MutableContext = {
  nonNullKeys: Set<string>
  nullKeys: Set<string>
  eqLiterals: Map<string, string>
  neqLiterals: Map<string, Set<string>>
  sourceNames: Set<string>
  contradiction: boolean
  unknown: boolean
}

type Frame = {
  readonly formula: PredicateFormula
  readonly polarity: "positive" | "negative"
}

type AstBackedExpression = Expression.Any & {
  readonly [ExpressionAst.TypeId]: ExpressionAst.Any
}

export const trueFormula = (): TrueFormula => ({ kind: "true" })
export const falseFormula = (): FalseFormula => ({ kind: "false" })
export const atomFormula = <Atom extends PredicateAtom>(atom: Atom): AtomFormula<Atom> => ({ kind: "atom", atom })
export const allFormula = (items: readonly PredicateFormula[]): PredicateFormula =>
  normalizeFormula({ kind: "all", items } satisfies AllFormula<readonly PredicateFormula[]>)
export const anyFormula = (items: readonly PredicateFormula[]): PredicateFormula =>
  normalizeFormula({ kind: "any", items } satisfies AnyFormula<readonly PredicateFormula[]>)
export const notFormula = (item: PredicateFormula): PredicateFormula =>
  normalizeFormula({ kind: "not", item } satisfies NotFormula<PredicateFormula>)

export const andFormula = (left: PredicateFormula, right: PredicateFormula): PredicateFormula =>
  allFormula([left, right])

export const orFormula = (left: PredicateFormula, right: PredicateFormula): PredicateFormula =>
  anyFormula([left, right])

const unknownTag = <Tag extends string>(tag: Tag): AtomFormula<UnknownAtom<Tag>> =>
  atomFormula({ kind: "unknown", tag })

const emptyContext = (): MutableContext => ({
  nonNullKeys: new Set(),
  nullKeys: new Set(),
  eqLiterals: new Map(),
  neqLiterals: new Map(),
  sourceNames: new Set(),
  contradiction: false,
  unknown: false
})

const cloneContext = (context: MutableContext): MutableContext => ({
  nonNullKeys: new Set(context.nonNullKeys),
  nullKeys: new Set(context.nullKeys),
  eqLiterals: new Map(context.eqLiterals),
  neqLiterals: new Map(
    Array.from(context.neqLiterals.entries(), ([key, values]) => [key, new Set(values)])
  ),
  sourceNames: new Set(context.sourceNames),
  contradiction: context.contradiction,
  unknown: context.unknown
})

const freezeContext = (context: MutableContext): RuntimeContext => context

const sourceNameOfKey = (key: string): string => key.split(".", 1)[0] ?? key

const addSourceName = (context: MutableContext, key: string): void => {
  context.sourceNames.add(sourceNameOfKey(key))
}

const addNonNull = (context: MutableContext, key: string): void => {
  addSourceName(context, key)
  if (context.nullKeys.has(key)) {
    context.contradiction = true
  }
  context.nonNullKeys.add(key)
}

const addNull = (context: MutableContext, key: string): void => {
  addSourceName(context, key)
  if (context.nonNullKeys.has(key)) {
    context.contradiction = true
  }
  context.nullKeys.add(key)
}

const addEqLiteral = (context: MutableContext, key: string, value: string): void => {
  addNonNull(context, key)
  const existing = context.eqLiterals.get(key)
  if (existing !== undefined && existing !== value) {
    context.contradiction = true
  }
  const neqValues = context.neqLiterals.get(key)
  if (neqValues?.has(value)) {
    context.contradiction = true
  }
  context.eqLiterals.set(key, value)
}

const addNeqLiteral = (context: MutableContext, key: string, value: string): void => {
  addNonNull(context, key)
  if (context.eqLiterals.get(key) === value) {
    context.contradiction = true
  }
  const values = context.neqLiterals.get(key) ?? new Set<string>()
  values.add(value)
  context.neqLiterals.set(key, values)
}

const applyEqColumn = (context: MutableContext, left: string, right: string): void => {
  const leftValue = context.eqLiterals.get(left)
  const rightValue = context.eqLiterals.get(right)
  if (leftValue === undefined && rightValue === undefined) {
    addNonNull(context, left)
    addNonNull(context, right)
    return
  }
  if (leftValue === undefined && rightValue !== undefined) {
    addNonNull(context, left)
    addEqLiteral(context, left, rightValue)
    return
  }
  if (leftValue !== undefined && rightValue === undefined) {
    addNonNull(context, right)
    addEqLiteral(context, right, leftValue)
    return
  }
  if (leftValue === rightValue) {
    addEqLiteral(context, left, leftValue!)
    addEqLiteral(context, right, rightValue!)
    return
  }
  context.contradiction = true
}

const applyAtom = (context: MutableContext, atom: PredicateAtom): void => {
  switch (atom.kind) {
    case "is-null":
      addNull(context, atom.key)
      return
    case "is-not-null":
      addNonNull(context, atom.key)
      return
    case "eq-literal":
      addEqLiteral(context, atom.key, atom.value)
      return
    case "neq-literal":
      addNeqLiteral(context, atom.key, atom.value)
      return
    case "eq-column":
      applyEqColumn(context, atom.left, atom.right)
      return
    case "unknown":
      context.unknown = true
      return
  }
}

const applyNegativeAtom = (context: MutableContext, atom: PredicateAtom): void => {
  switch (atom.kind) {
    case "is-null":
      addNonNull(context, atom.key)
      return
    case "is-not-null":
      addNull(context, atom.key)
      return
    case "eq-literal":
      addNeqLiteral(context, atom.key, atom.value)
      return
    case "neq-literal":
      addEqLiteral(context, atom.key, atom.value)
      return
    case "eq-column":
      addNonNull(context, atom.left)
      addNonNull(context, atom.right)
      return
    case "unknown":
      context.unknown = true
      return
  }
}

const intersectEqLiterals = (
  left: ReadonlyMap<string, string>,
  right: ReadonlyMap<string, string>
): Map<string, string> => {
  const result = new Map<string, string>()
  for (const [key, value] of left) {
    if (right.get(key) === value) {
      result.set(key, value)
    }
  }
  return result
}

const intersectNeqLiterals = (
  left: ReadonlyMap<string, ReadonlySet<string>>,
  right: ReadonlyMap<string, ReadonlySet<string>>
): Map<string, Set<string>> => {
  const result = new Map<string, Set<string>>()
  for (const [key, leftValues] of left) {
    const rightValues = right.get(key)
    if (rightValues === undefined) {
      continue
    }
    const next = new Set(Array.from(leftValues).filter((value) => rightValues.has(value)))
    if (next.size > 0) {
      result.set(key, next)
    }
  }
  return result
}

const intersectContexts = (left: MutableContext, right: MutableContext): MutableContext => {
  if (left.contradiction) {
    return cloneContext(right)
  }
  if (right.contradiction) {
    return cloneContext(left)
  }
  return {
    nonNullKeys: new Set(Array.from(left.nonNullKeys).filter((key) => right.nonNullKeys.has(key))),
    nullKeys: new Set(Array.from(left.nullKeys).filter((key) => right.nullKeys.has(key))),
    eqLiterals: intersectEqLiterals(left.eqLiterals, right.eqLiterals),
    neqLiterals: intersectNeqLiterals(left.neqLiterals, right.neqLiterals),
    sourceNames: new Set(Array.from(left.sourceNames).filter((name) => right.sourceNames.has(name))),
    contradiction: false,
    unknown: left.unknown || right.unknown
  }
}

const analyzeBranchSet = (
  context: MutableContext,
  items: readonly PredicateFormula[],
  polarity: "positive" | "negative"
): MutableContext => {
  let current: MutableContext | undefined
  for (const item of items) {
    const branch = analyzeStack(cloneContext(context), [{ formula: item, polarity }])
    if (branch.contradiction) {
      continue
    }
    current = current === undefined ? branch : intersectContexts(current, branch)
  }
  if (current === undefined) {
    const next = cloneContext(context)
    next.contradiction = true
    return next
  }
  return current
}

const analyzeStack = (context: MutableContext, stack: readonly Frame[]): MutableContext => {
  const queue = [...stack]
  while (queue.length > 0 && !context.contradiction) {
    const frame = queue.shift()!
    switch (frame.formula.kind) {
      case "true":
        if (frame.polarity === "negative") {
          context.contradiction = true
        }
        break
      case "false":
        if (frame.polarity === "positive") {
          context.contradiction = true
        }
        break
      case "atom":
        if (frame.polarity === "positive") {
          applyAtom(context, frame.formula.atom)
        } else {
          applyNegativeAtom(context, frame.formula.atom)
        }
        break
      case "not":
        queue.unshift({
          formula: frame.formula.item,
          polarity: frame.polarity === "positive" ? "negative" : "positive"
        })
        break
      case "all":
        if (frame.polarity === "positive") {
          queue.unshift(...frame.formula.items.map((formula) => ({ formula, polarity: "positive" as const })))
        } else {
          context = analyzeBranchSet(context, frame.formula.items, "negative")
        }
        break
      case "any":
        if (frame.polarity === "positive") {
          context = analyzeBranchSet(context, frame.formula.items, "positive")
        } else {
          queue.unshift(...frame.formula.items.map((formula) => ({ formula, polarity: "negative" as const })))
        }
        break
    }
  }
  return context
}

export const analyzeFormula = (formula: PredicateFormula): RuntimeContext =>
  freezeContext(analyzeStack(emptyContext(), [{ formula, polarity: "positive" }]))

const astOf = (value: Expression.Any): ExpressionAst.Any =>
  (value as AstBackedExpression)[ExpressionAst.TypeId]

const columnKeyOfExpression = (value: Expression.Any): string | undefined => {
  const ast = astOf(value)
  return ast.kind === "column" ? `${ast.tableName}.${ast.columnName}` : undefined
}

const valueKeyOfLiteral = (value: unknown): string => {
  if (typeof value === "string") {
    return `string:${value}`
  }
  if (typeof value === "number") {
    return `number:${value}`
  }
  if (typeof value === "boolean") {
    return `boolean:${value}`
  }
  if (value === null) {
    return "null"
  }
  if (value instanceof Date) {
    return `date:${value.toISOString()}`
  }
  return "unknown"
}

const nonNullFactsOfExpression = (value: Expression.Any): PredicateFormula | undefined => {
  const key = columnKeyOfExpression(value)
  return key === undefined ? undefined : atomFormula<NonNullAtom<string>>({ kind: "is-not-null", key })
}

const combineFacts = (
  left: PredicateFormula | undefined,
  right: PredicateFormula | undefined
): PredicateFormula => {
  if (left === undefined) {
    return right ?? trueFormula()
  }
  if (right === undefined) {
    return left
  }
  return andFormula(left, right)
}

const formulaOfEq = (left: Expression.Any, right: Expression.Any): PredicateFormula => {
  const leftKey = columnKeyOfExpression(left)
  const rightKey = columnKeyOfExpression(right)
  const leftAst = astOf(left)
  const rightAst = astOf(right)
  const leftLiteral = leftAst.kind === "literal" ? leftAst.value : undefined
  const rightLiteral = rightAst.kind === "literal" ? rightAst.value : undefined

  if (leftKey === undefined && rightKey === undefined) {
    if (leftAst.kind !== "literal" || rightAst.kind !== "literal") {
      return unknownTag("eq:unsupported")
    }
    if (leftLiteral === null || rightLiteral === null) {
      return falseFormula()
    }
    return Object.is(leftLiteral, rightLiteral) ? trueFormula() : falseFormula()
  }

  if (leftKey === undefined) {
    if (leftAst.kind !== "literal") {
      return unknownTag("eq:unsupported")
    }
    if (leftLiteral === null) {
      return falseFormula()
    }
    return atomFormula<EqLiteralAtom<string, string>>({
      kind: "eq-literal",
      key: rightKey!,
      value: valueKeyOfLiteral(leftLiteral)
    })
  }

  if (rightKey === undefined) {
    if (rightAst.kind !== "literal") {
      return unknownTag("eq:unsupported")
    }
    if (rightLiteral === null) {
      return falseFormula()
    }
    return atomFormula<EqLiteralAtom<string, string>>({
      kind: "eq-literal",
      key: leftKey,
      value: valueKeyOfLiteral(rightLiteral)
    })
  }

  return atomFormula<EqColumnAtom<string, string>>({
    kind: "eq-column",
    left: leftKey,
    right: rightKey
  })
}

const formulaOfNeq = (left: Expression.Any, right: Expression.Any): PredicateFormula => {
  const leftKey = columnKeyOfExpression(left)
  const rightKey = columnKeyOfExpression(right)
  const leftAst = astOf(left)
  const rightAst = astOf(right)
  const leftLiteral = leftAst.kind === "literal" ? leftAst.value : undefined
  const rightLiteral = rightAst.kind === "literal" ? rightAst.value : undefined

  if (leftKey === undefined && rightKey === undefined) {
    if (leftAst.kind !== "literal" || rightAst.kind !== "literal") {
      return unknownTag("neq:unsupported")
    }
    if (leftLiteral === null || rightLiteral === null) {
      return falseFormula()
    }
    return Object.is(leftLiteral, rightLiteral) ? falseFormula() : trueFormula()
  }

  if (leftKey === undefined) {
    if (leftAst.kind !== "literal") {
      return unknownTag("neq:unsupported")
    }
    if (leftLiteral === null) {
      return falseFormula()
    }
    return atomFormula<NeqLiteralAtom<string, string>>({
      kind: "neq-literal",
      key: rightKey!,
      value: valueKeyOfLiteral(leftLiteral)
    })
  }

  if (rightKey === undefined) {
    if (rightAst.kind !== "literal") {
      return unknownTag("neq:unsupported")
    }
    if (rightLiteral === null) {
      return falseFormula()
    }
    return atomFormula<NeqLiteralAtom<string, string>>({
      kind: "neq-literal",
      key: leftKey,
      value: valueKeyOfLiteral(rightLiteral)
    })
  }

  return combineFacts(nonNullFactsOfExpression(left), nonNullFactsOfExpression(right))
}

const formulaOfIsNotDistinctFrom = (left: Expression.Any, right: Expression.Any): PredicateFormula => {
  const leftKey = columnKeyOfExpression(left)
  const rightKey = columnKeyOfExpression(right)
  const leftAst = astOf(left)
  const rightAst = astOf(right)
  const leftLiteral = leftAst.kind === "literal" ? leftAst.value : undefined
  const rightLiteral = rightAst.kind === "literal" ? rightAst.value : undefined

  if (leftAst.kind === "literal" && rightAst.kind === "literal") {
    return Object.is(leftLiteral, rightLiteral) ? trueFormula() : falseFormula()
  }
  if (leftAst.kind === "literal" && leftLiteral === null && rightKey !== undefined) {
    return atomFormula<NullAtom<string>>({ kind: "is-null", key: rightKey })
  }
  if (rightAst.kind === "literal" && rightLiteral === null && leftKey !== undefined) {
    return atomFormula<NullAtom<string>>({ kind: "is-null", key: leftKey })
  }
  if (leftAst.kind === "literal" && rightKey !== undefined) {
    return atomFormula<EqLiteralAtom<string, string>>({
      kind: "eq-literal",
      key: rightKey,
      value: valueKeyOfLiteral(leftLiteral)
    })
  }
  if (rightAst.kind === "literal" && leftKey !== undefined) {
    return atomFormula<EqLiteralAtom<string, string>>({
      kind: "eq-literal",
      key: leftKey,
      value: valueKeyOfLiteral(rightLiteral)
    })
  }
  return unknownTag("isNotDistinctFrom:unsupported")
}

export const normalizeFormula = (formula: PredicateFormula): PredicateFormula => {
  switch (formula.kind) {
    case "all": {
      const items: PredicateFormula[] = []
      for (const item of formula.items) {
        const normalized = normalizeFormula(item)
        if (normalized.kind === "true") {
          continue
        }
        if (normalized.kind === "false") {
          return falseFormula()
        }
        if (normalized.kind === "all") {
          items.push(...normalized.items)
        } else {
          items.push(normalized)
        }
      }
      if (items.length === 0) {
        return trueFormula()
      }
      if (items.length === 1) {
        return items[0]!
      }
      return { kind: "all", items }
    }
    case "any": {
      const items: PredicateFormula[] = []
      for (const item of formula.items) {
        const normalized = normalizeFormula(item)
        if (normalized.kind === "false") {
          continue
        }
        if (normalized.kind === "true") {
          return trueFormula()
        }
        if (normalized.kind === "any") {
          items.push(...normalized.items)
        } else {
          items.push(normalized)
        }
      }
      if (items.length === 0) {
        return falseFormula()
      }
      if (items.length === 1) {
        return items[0]!
      }
      return { kind: "any", items }
    }
    case "not": {
      const item = normalizeFormula(formula.item)
      if (item.kind === "true") {
        return falseFormula()
      }
      if (item.kind === "false") {
        return trueFormula()
      }
      return { kind: "not", item }
    }
    default:
      return formula
  }
}

export const formulaOfExpression = (value: Expression.Any): PredicateFormula => {
  const ast = astOf(value)
  switch (ast.kind) {
    case "literal":
      if (ast.value === true) {
        return trueFormula()
      }
      if (ast.value === false) {
        return falseFormula()
      }
      return unknownTag("literal:non-boolean")
    case "isNull": {
      const key = columnKeyOfExpression(ast.value)
      return key === undefined
        ? unknownTag("isNull:unsupported")
        : atomFormula<NullAtom<string>>({ kind: "is-null", key })
    }
    case "isNotNull": {
      const key = columnKeyOfExpression(ast.value)
      return key === undefined
        ? unknownTag("isNotNull:unsupported")
        : atomFormula<NonNullAtom<string>>({ kind: "is-not-null", key })
    }
    case "not":
      return notFormula(formulaOfExpression(ast.value))
    case "eq":
      return formulaOfEq(ast.left, ast.right)
    case "neq":
      return formulaOfNeq(ast.left, ast.right)
    case "isNotDistinctFrom":
      return formulaOfIsNotDistinctFrom(ast.left, ast.right)
    case "isDistinctFrom":
      return notFormula(formulaOfIsNotDistinctFrom(ast.left, ast.right))
    case "and":
      return allFormula(ast.values.map((value: Expression.Any) => formulaOfExpression(value)))
    case "or":
      return anyFormula(ast.values.map((value: Expression.Any) => formulaOfExpression(value)))
    case "in": {
      const [left, ...rest] = ast.values
      return left === undefined
        ? falseFormula()
        : anyFormula(rest.map((value: Expression.Any) => formulaOfEq(left, value)))
    }
    case "notIn": {
      const [left, ...rest] = ast.values
      return left === undefined
        ? trueFormula()
        : combineFacts(
            nonNullFactsOfExpression(left),
            allFormula(rest.map((value: Expression.Any) => formulaOfNeq(left, value)))
          )
    }
    case "between":
      return combineFacts(
        ast.values.reduce<PredicateFormula | undefined>(
          (current: PredicateFormula | undefined, entry: Expression.Any) => combineFacts(current, nonNullFactsOfExpression(entry)),
          undefined
        ),
        unknownTag("variadic:between")
      )
    case "lt":
    case "lte":
    case "gt":
    case "gte":
    case "like":
    case "ilike":
    case "contains":
    case "containedBy":
    case "overlaps":
      return combineFacts(nonNullFactsOfExpression(ast.left), nonNullFactsOfExpression(ast.right))
    default:
      return unknownTag(`expr:${ast.kind}`)
  }
}

export const formulaOfPredicate = (value: Expression.Any | boolean): PredicateFormula =>
  value === true
    ? trueFormula()
    : value === false
      ? falseFormula()
      : formulaOfExpression(value)

export const assumeFormulaTrue = (assumptions: PredicateFormula, formula: PredicateFormula): PredicateFormula =>
  assumptions.kind === "true" ? formula : andFormula(assumptions, formula)

export const assumeFormulaFalse = (assumptions: PredicateFormula, formula: PredicateFormula): PredicateFormula =>
  assumptions.kind === "true" ? notFormula(formula) : andFormula(assumptions, notFormula(formula))

export const contradictsFormula = (assumptions: PredicateFormula, formula: PredicateFormula): boolean =>
  analyzeFormula(andFormula(assumptions, formula)).contradiction

export const impliesFormula = (assumptions: PredicateFormula, formula: PredicateFormula): boolean =>
  analyzeFormula(andFormula(assumptions, notFormula(formula))).contradiction

export const guaranteedNonNullKeys = (assumptions: PredicateFormula): ReadonlySet<string> =>
  analyzeFormula(assumptions).nonNullKeys

export const guaranteedNullKeys = (assumptions: PredicateFormula): ReadonlySet<string> =>
  analyzeFormula(assumptions).nullKeys

export const guaranteedSourceNames = (assumptions: PredicateFormula): ReadonlySet<string> =>
  analyzeFormula(assumptions).sourceNames
