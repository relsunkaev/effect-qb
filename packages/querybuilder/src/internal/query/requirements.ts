/** Query capabilities directly modeled by the current plan AST. */
export type QueryCapability = "read" | "write" | "ddl" | "transaction" | "locking"

/**
 * Capability or query-mode requirement associated with a dialect error.
 *
 * Not every requirement is currently expressible by query plans. The extra
 * vocabulary exists so dialect maps can stay stable as the plan surface grows.
 */
export type QueryRequirement =
  | QueryCapability
  | "ddl"
  | "transaction"
  | "locking"

/** Runtime capability list for the current read-only query plans. */
export const read_query_capabilities = ["read"] as const

/** Type-level union of two capability sets. */
export type MergeCapabilities<
  Left extends QueryCapability,
  Right extends QueryCapability
> = Left | Right

/** Type-level union of capability sets across a readonly tuple. */
export type MergeCapabilityTuple<
  Values extends readonly QueryCapability[],
  Current extends QueryCapability = never
> = Values extends readonly [
  infer Head extends QueryCapability,
  ...infer Tail extends readonly QueryCapability[]
]
  ? MergeCapabilityTuple<Tail, Current | Head>
  : Current

/** Dedupes and normalizes capability lists at runtime. */
export const union_query_capabilities = (
  ...values: ReadonlyArray<ReadonlyArray<QueryCapability>>
): ReadonlyArray<QueryCapability> =>
  [...new Set(values.flatMap((value) => value))]
