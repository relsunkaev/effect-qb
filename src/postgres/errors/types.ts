/** Structured Postgres error-report fields commonly exposed by drivers. */
export type PostgresErrorSemanticField =
  | "schema"
  | "table"
  | "column"
  | "constraint"
  | "dataType"
  | "position"
  | "internalPosition"
  | "internalQuery"
  | "file"
  | "line"
  | "routine"

/** Class-level metadata for a family of SQLSTATE errors. */
export interface PostgresSqlStateClassMetadata<
  ClassCode extends string = string,
  ClassName extends string = string
> {
  readonly classCode: ClassCode
  readonly className: ClassName
  readonly tag: string
}

/** Metadata for a single Postgres SQLSTATE condition. */
export interface PostgresSqlStateMetadata<
  Code extends string = string,
  Condition extends string = string,
  ClassCode extends string = string,
  ClassName extends string = string
> {
  readonly code: Code
  readonly condition: Condition
  readonly classCode: ClassCode
  readonly className: ClassName
  readonly tag: string
  readonly semanticFields: readonly PostgresErrorSemanticField[]
}
