export type BrandedErrorOf<Value> = Value extends { __effect_qb_error__: infer Error }
  ? Error
  : never

export type BrandedHintOf<Value> = Value extends { __effect_qb_hint__: infer Hint }
  ? Hint
  : never

export type BrandedMissingSourcesOf<Value> = Value extends {
  __effect_qb_missing_sources__: infer MissingSources
}
  ? MissingSources
  : never

export type BrandedStatementOf<Value> = Value extends { __effect_qb_statement__: infer Statement }
  ? Statement
  : never
