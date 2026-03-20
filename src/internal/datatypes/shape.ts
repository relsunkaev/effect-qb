import type {
  BigIntString,
  DecimalString,
  InstantString,
  JsonValue,
  LocalDateString,
  LocalDateTimeString,
  LocalTimeString,
  OffsetTimeString,
  YearString
} from "../runtime-value.ts"

export type RuntimeTag =
  | "string"
  | "number"
  | "bigintString"
  | "boolean"
  | "json"
  | "localDate"
  | "localTime"
  | "offsetTime"
  | "localDateTime"
  | "instant"
  | "year"
  | "decimalString"
  | "bytes"
  | "array"
  | "record"
  | "unknown"
  | "null"

export type RuntimeOfTag<Tag extends RuntimeTag> =
  Tag extends "string" ? string :
    Tag extends "number" ? number :
      Tag extends "bigintString" ? BigIntString :
        Tag extends "boolean" ? boolean :
        Tag extends "json" ? JsonValue :
          Tag extends "localDate" ? LocalDateString :
            Tag extends "localTime" ? LocalTimeString :
              Tag extends "offsetTime" ? OffsetTimeString :
                Tag extends "localDateTime" ? LocalDateTimeString :
                  Tag extends "instant" ? InstantString :
                    Tag extends "year" ? YearString :
                      Tag extends "decimalString" ? DecimalString :
                        Tag extends "bytes" ? Uint8Array :
                          Tag extends "array" ? ReadonlyArray<unknown> :
                            Tag extends "record" ? Record<string, unknown> :
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
