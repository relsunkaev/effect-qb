export type JsonPathUsageError<
  Operation extends string,
  Root,
  Path,
  Reason extends string
> = {
  readonly __effect_qb_error__: "effect-qb: invalid json path usage"
  readonly __effect_qb_json_operation__: Operation
  readonly __effect_qb_json_reason__: Reason
  readonly __effect_qb_json_root__: Root
  readonly __effect_qb_json_path__: Path
  readonly __effect_qb_hint__: "Use key(...) on objects, index(...) on arrays, and prefer exact key/index paths when you want precise output typing"
}
