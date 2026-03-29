import type * as Expression from "../scalar.js"
import type { RuntimeOfTag, RuntimeTag } from "./shape.js"

type ExactKindFamily =
  | "array"
  | "range"
  | "multirange"
  | "record"
  | "enum"
  | "set"

type BaseFamilyOf<Db extends Expression.DbType.Base<any, any>> =
  Db extends { readonly family?: infer Family extends string }
    ? Family
    : Db["kind"] extends "null"
      ? "null"
      : `other:${Db["dialect"]}:${Db["kind"]}`

type BaseRuntimeTagOf<Db extends Expression.DbType.Base<any, any>> =
  Db extends { readonly runtime?: infer Runtime extends RuntimeTag }
    ? Runtime
    : "unknown"

type BaseCompareGroupOf<Db extends Expression.DbType.Base<any, any>> =
  Db extends { readonly compareGroup?: infer CompareGroup extends string }
    ? CompareGroup
    : BaseFamilyOf<Db>

type BaseCastTargetsOf<Db extends Expression.DbType.Base<any, any>> =
  Db extends { readonly castTargets?: readonly (infer Target extends string)[] }
    ? Target
    : never

type BaseHasTextualTrait<Db extends Expression.DbType.Base<any, any>> =
  Db extends { readonly traits?: infer Traits }
    ? Traits extends { readonly textual: true }
      ? true
      : false
    : false

export type FamilyOfDbType<Db extends Expression.DbType.Any> =
  Db extends Expression.DbType.Domain<any, infer Base extends Expression.DbType.Any, any>
    ? FamilyOfDbType<Base>
    : Db extends Expression.DbType.Array<any, any, any>
      ? "array"
      : Db extends Expression.DbType.Range<any, any, any>
        ? "range"
        : Db extends Expression.DbType.Multirange<any, any, any>
          ? "multirange"
          : Db extends Expression.DbType.Composite<any, any, any>
            ? "record"
            : Db extends Expression.DbType.Enum<any, any>
              ? "enum"
              : Db extends Expression.DbType.Set<any, any>
                ? "set"
                : Db extends Expression.DbType.Json<any, any>
                  ? "json"
                  : Db extends Expression.DbType.Base<any, any>
                    ? BaseFamilyOf<Db>
                    : "other:unknown:unknown"

export type CompareGroupOfDbType<Db extends Expression.DbType.Any> =
  Db extends Expression.DbType.Domain<any, infer Base extends Expression.DbType.Any, any>
    ? CompareGroupOfDbType<Base>
    : Db extends Expression.DbType.Array<any, any, infer Kind extends string>
      ? Kind
      : Db extends Expression.DbType.Range<any, any, infer Kind extends string>
        ? Kind
        : Db extends Expression.DbType.Multirange<any, any, infer Kind extends string>
          ? Kind
          : Db extends Expression.DbType.Composite<any, any, infer Kind extends string>
            ? Kind
            : Db extends Expression.DbType.Enum<any, infer Kind extends string>
              ? Kind
              : Db extends Expression.DbType.Set<any, infer Kind extends string>
                ? Kind
                : Db extends Expression.DbType.Json<any, any>
                  ? never
                  : Db extends Expression.DbType.Base<any, any>
                    ? BaseCompareGroupOf<Db>
                    : "other:unknown:unknown"

export type RuntimeOfDbType<Db extends Expression.DbType.Any> =
  Db extends Expression.DbType.Domain<any, infer Base extends Expression.DbType.Any, any>
    ? RuntimeOfDbType<Base>
    : Db extends Expression.DbType.Array<any, infer Element extends Expression.DbType.Any, any>
      ? ReadonlyArray<RuntimeOfDbType<Element>>
      : Db extends Expression.DbType.Composite<any, infer Fields extends Record<string, Expression.DbType.Any>, any>
        ? { readonly [K in keyof Fields]: RuntimeOfDbType<Fields[K]> }
        : Db extends Expression.DbType.Range<any, any, any> | Expression.DbType.Multirange<any, any, any>
          ? unknown
          : Db extends Expression.DbType.Json<any, any>
            ? import("../runtime/value.js").JsonValue
            : Db extends Expression.DbType.Enum<any, any> | Expression.DbType.Set<any, any>
              ? string
              : Db extends Expression.DbType.Base<any, any>
                ? BaseRuntimeTagOf<Db> extends infer Runtime extends RuntimeTag
                  ? RuntimeOfTag<Runtime>
                  : unknown
                : unknown

export type CanCompareDbTypes<
  Left extends Expression.DbType.Any,
  Right extends Expression.DbType.Any,
  Dialect extends string
> = Left extends { readonly dialect: Dialect }
  ? Right extends { readonly dialect: Dialect }
    ? CompareGroupOfDbType<Left> extends never
      ? false
      : CompareGroupOfDbType<Right> extends never
        ? false
        : CompareGroupOfDbType<Left> extends "null"
          ? false
          : CompareGroupOfDbType<Right> extends "null"
            ? false
            : [CompareGroupOfDbType<Left>] extends [CompareGroupOfDbType<Right>]
              ? [CompareGroupOfDbType<Right>] extends [CompareGroupOfDbType<Left>]
                ? true
                : false
              : false
    : false
  : false

export type CanContainDbTypes<
  Left extends Expression.DbType.Any,
  Right extends Expression.DbType.Any,
  Dialect extends string
> = Left extends { readonly dialect: Dialect }
  ? Right extends { readonly dialect: Dialect }
    ? FamilyOfDbType<Left> extends "array" | "range" | "multirange"
      ? FamilyOfDbType<Right> extends "array" | "range" | "multirange"
        ? [CompareGroupOfDbType<Left>] extends [CompareGroupOfDbType<Right>]
          ? [CompareGroupOfDbType<Right>] extends [CompareGroupOfDbType<Left>]
            ? true
            : false
          : false
        : false
      : false
    : false
  : false

export type CanTextuallyCoerceDbType<
  Db extends Expression.DbType.Any,
  Dialect extends string
> = Db extends { readonly dialect: Dialect }
  ? Db extends Expression.DbType.Domain<any, infer Base extends Expression.DbType.Any, any>
    ? CanTextuallyCoerceDbType<Base, Dialect>
    : Db extends Expression.DbType.Enum<any, any> | Expression.DbType.Set<any, any>
      ? true
      : Db extends Expression.DbType.Json<any, any>
        ? false
        : Db extends Expression.DbType.Base<any, any>
          ? BaseHasTextualTrait<Db>
          : false
  : false

export type CanCastDbType<
  Source extends Expression.DbType.Any,
  Target extends Expression.DbType.Any,
  Dialect extends string
> = Source extends { readonly dialect: Dialect }
  ? Target extends { readonly dialect: Dialect }
    ? Source extends Expression.DbType.Domain<any, infer Base extends Expression.DbType.Any, any>
      ? CanCastDbType<Base, Target, Dialect>
      : Target extends Expression.DbType.Domain<any, infer TargetBase extends Expression.DbType.Any, any>
        ? CanCastDbType<Source, TargetBase, Dialect>
        : [CompareGroupOfDbType<Source>] extends [CompareGroupOfDbType<Target>]
          ? [CompareGroupOfDbType<Target>] extends [CompareGroupOfDbType<Source>]
            ? true
            : false
          : Target extends
              | Expression.DbType.Array<any, any, any>
              | Expression.DbType.Range<any, any, any>
              | Expression.DbType.Multirange<any, any, any>
              | Expression.DbType.Composite<any, any, any>
              | Expression.DbType.Enum<any, any>
              | Expression.DbType.Set<any, any>
            ? true
            : Source extends Expression.DbType.Base<any, any>
              ? Target extends Expression.DbType.Base<any, any>
                ? BaseFamilyOf<Target> extends ExactKindFamily
                  ? false
                  : BaseFamilyOf<Target> extends BaseCastTargetsOf<Source>
                    ? true
                    : false
                : false
              : false
    : false
  : false
