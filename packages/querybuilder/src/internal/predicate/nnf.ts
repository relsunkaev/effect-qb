import type { EqColumnAtom, EqLiteralAtom, NeqLiteralAtom, NonNullAtom, NullAtom, PredicateAtom, UnknownAtom } from "./atom.js"
import type { PredicateFormula } from "./formula.js"

export type NegateAtom<Atom extends PredicateAtom> =
  Atom extends NullAtom<infer Key extends string> ? NonNullAtom<Key> :
    Atom extends NonNullAtom<infer Key extends string> ? NullAtom<Key> :
      Atom extends EqLiteralAtom<infer Key extends string, infer Value extends string> ? NeqLiteralAtom<Key, Value> :
        Atom extends NeqLiteralAtom<infer Key extends string, infer Value extends string> ? EqLiteralAtom<Key, Value> :
          Atom extends EqColumnAtom<any, any> ? UnknownAtom<"not:eq-column"> :
            UnknownAtom<"not:unknown">

export type ToNnf<Formula extends PredicateFormula> = Formula
