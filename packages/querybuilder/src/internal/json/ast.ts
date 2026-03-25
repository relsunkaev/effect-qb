import type * as Expression from ".././expression.js"
import type * as JsonPath from "./path.js"

export type JsonKind =
  | "jsonGet"
  | "jsonPath"
  | "jsonAccess"
  | "jsonTraverse"
  | "jsonGetText"
  | "jsonPathText"
  | "jsonAccessText"
  | "jsonTraverseText"
  | "jsonHasKey"
  | "jsonKeyExists"
  | "jsonHasAnyKeys"
  | "jsonHasAllKeys"
  | "jsonConcat"
  | "jsonMerge"
  | "jsonDelete"
  | "jsonDeletePath"
  | "jsonRemove"
  | "jsonSet"
  | "jsonInsert"
  | "jsonPathExists"
  | "jsonPathMatch"
  | "jsonBuildObject"
  | "jsonBuildArray"
  | "jsonToJson"
  | "jsonToJsonb"
  | "jsonTypeOf"
  | "jsonLength"
  | "jsonKeys"
  | "jsonStripNulls"

/**
 * Broad JSON AST node accepted by the renderer.
 *
 * The JSON subsystem is intentionally shaped as a small grammar rather than a
 * collection of bespoke node interfaces. The renderer uses the `kind` plus the
 * common field names below to lower the nodes into dialect SQL.
 */
export interface JsonNode<
  Kind extends JsonKind = JsonKind
> {
  readonly kind: Kind
  readonly value?: Expression.Any
  readonly base?: Expression.Any
  readonly left?: Expression.Any
  readonly right?: Expression.Any
  readonly path?: JsonPath.Path<any> | readonly any[]
  readonly segments?: readonly any[]
  readonly keys?: readonly string[]
  readonly query?: string | Expression.Any
  readonly newValue?: Expression.Any
  readonly insert?: Expression.Any
  readonly createMissing?: boolean
  readonly insertAfter?: boolean
  readonly entries?: readonly {
    readonly key: string
    readonly value: Expression.Any
  }[]
  readonly values?: readonly Expression.Any[]
}
