export interface NullAtom<Key extends string> {
  readonly kind: "is-null"
  readonly key: Key
}

export interface NonNullAtom<Key extends string> {
  readonly kind: "is-not-null"
  readonly key: Key
}

export interface EqLiteralAtom<Key extends string, Value extends string> {
  readonly kind: "eq-literal"
  readonly key: Key
  readonly value: Value
}

export interface NeqLiteralAtom<Key extends string, Value extends string> {
  readonly kind: "neq-literal"
  readonly key: Key
  readonly value: Value
}

export interface LiteralSetAtom<Key extends string, Values extends string> {
  readonly kind: "literal-set"
  readonly key: Key
  readonly values: readonly Values[]
}

export interface EqColumnAtom<
  LeftKey extends string,
  RightKey extends string
> {
  readonly kind: "eq-column"
  readonly left: LeftKey
  readonly right: RightKey
}

export interface UnknownAtom<Tag extends string> {
  readonly kind: "unknown"
  readonly tag: Tag
}

export type PredicateAtom =
  | NullAtom<string>
  | NonNullAtom<string>
  | EqLiteralAtom<string, string>
  | NeqLiteralAtom<string, string>
  | LiteralSetAtom<string, string>
  | EqColumnAtom<string, string>
  | UnknownAtom<string>
