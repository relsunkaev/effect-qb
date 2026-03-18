export type RuntimeTag =
  | "string"
  | "number"
  | "bigint"
  | "boolean"
  | "date"
  | "bytes"
  | "unknown"
  | "null"

export type RuntimeOfTag<Tag extends RuntimeTag> =
  Tag extends "string" ? string :
    Tag extends "number" ? number :
      Tag extends "bigint" ? bigint :
        Tag extends "boolean" ? boolean :
          Tag extends "date" ? Date :
            Tag extends "bytes" ? Uint8Array :
              Tag extends "null" ? null :
                unknown

export interface DatatypeTraits {
  readonly textual?: true
  readonly ordered?: true
}

export interface DatatypeFamilySpec<
  CompareGroup extends string = string,
  CastTargets extends readonly string[] = readonly string[],
  Traits extends DatatypeTraits = DatatypeTraits
> {
  readonly compareGroup: CompareGroup
  readonly castTargets: CastTargets
  readonly traits: Traits
}

export interface DatatypeKindSpec<
  Family extends string = string,
  Runtime extends RuntimeTag = RuntimeTag
> {
  readonly family: Family
  readonly runtime: Runtime
}
