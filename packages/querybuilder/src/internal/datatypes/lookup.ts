import type * as Expression from "../scalar.js"
import type { mysqlDatatypeFamilies, mysqlDatatypeKinds } from "../../mysql/datatypes/spec.js"
import type { postgresDatatypeFamilies, postgresDatatypeKinds } from "../../postgres/datatypes/spec.js"
import type { RuntimeOfTag, RuntimeTag } from "./shape.js"

type KnownDialect = "postgres" | "mysql"

type DialectKinds<Dialect extends KnownDialect> =
  Dialect extends "postgres" ? typeof postgresDatatypeKinds :
    typeof mysqlDatatypeKinds

type DialectFamilies<Dialect extends KnownDialect> =
  Dialect extends "postgres" ? typeof postgresDatatypeFamilies :
    typeof mysqlDatatypeFamilies

type StripParameterizedKind<Kind extends string> =
  Kind extends `${infer Base}(${string}`
    ? StripParameterizedKind<Base>
    : Kind

type StripArrayKind<Kind extends string> =
  Kind extends `${infer Base}[]`
    ? StripArrayKind<Base>
    : Kind

type BaseKind<Kind extends string> = StripArrayKind<StripParameterizedKind<Kind>>

type IsArrayKind<Kind extends string> = Kind extends `${string}[]` ? true : false

type ExactKindFamily =
  | "array"
  | "range"
  | "multirange"
  | "record"
  | "enum"
  | "set"

type KnownKindFamily<
  Dialect extends KnownDialect,
  Kind extends string
> = IsArrayKind<Kind> extends true
  ? "array"
  : BaseKind<Kind> extends "null"
    ? "null"
    : BaseKind<Kind> extends keyof DialectKinds<Dialect>
      ? DialectKinds<Dialect>[BaseKind<Kind>] extends { readonly family: infer Family extends string }
        ? Family
        : never
      : `other:${Dialect}:${Kind}`

type KnownKindRuntimeTag<
  Dialect extends KnownDialect,
  Kind extends string
> = IsArrayKind<Kind> extends true
  ? "array"
  : BaseKind<Kind> extends "null"
    ? "null"
    : BaseKind<Kind> extends keyof DialectKinds<Dialect>
      ? DialectKinds<Dialect>[BaseKind<Kind>] extends { readonly runtime: infer Runtime extends RuntimeTag }
        ? Runtime
        : "unknown"
      : "unknown"

type FamilyCastTargets<
  Dialect extends KnownDialect,
  Family extends string
> = Family extends keyof DialectFamilies<Dialect>
  ? DialectFamilies<Dialect>[Family] extends { readonly castTargets: readonly (infer CastTarget extends string)[] }
    ? CastTarget
    : never
  : never

type FamilyHasTextualTrait<
  Dialect extends KnownDialect,
  Family extends string
> = Family extends keyof DialectFamilies<Dialect>
  ? DialectFamilies<Dialect>[Family] extends { readonly traits: infer Traits }
    ? Traits extends { readonly textual: true }
      ? true
      : false
    : false
  : false

type BaseFamilyOf<
  Dialect extends KnownDialect,
  Kind extends string
> = Kind extends keyof DialectKinds<Dialect>
  ? DialectKinds<Dialect>[Kind] extends { readonly family: infer Family extends string }
    ? Family
    : never
  : `other:${Dialect}:${Kind}`

type BaseRuntimeTagOf<
  Dialect extends KnownDialect,
  Kind extends string
> = Kind extends keyof DialectKinds<Dialect>
  ? DialectKinds<Dialect>[Kind] extends { readonly runtime: infer Runtime extends RuntimeTag }
    ? Runtime
    : "unknown"
  : "unknown"

type BaseCompareGroupOf<
  Dialect extends KnownDialect,
  Kind extends string
> = BaseFamilyOf<Dialect, Kind> extends ExactKindFamily
  ? Kind
  : BaseFamilyOf<Dialect, Kind> extends keyof DialectFamilies<Dialect>
    ? DialectFamilies<Dialect>[BaseFamilyOf<Dialect, Kind>] extends { readonly compareGroup: infer CompareGroup extends string }
      ? CompareGroup
      : never
    : BaseFamilyOf<Dialect, Kind>

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
              : Db extends Expression.DbType.Base<infer Dialect extends KnownDialect, infer Kind extends string>
                ? BaseFamilyOf<Dialect, Kind>
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
                : Db extends Expression.DbType.Base<infer Dialect extends KnownDialect, infer Kind extends string>
                  ? BaseCompareGroupOf<Dialect, Kind>
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
          ? import("../runtime-value.js").JsonValue
            : Db extends Expression.DbType.Enum<any, any> | Expression.DbType.Set<any, any>
            ? string
            : Db extends Expression.DbType.Base<infer Dialect extends KnownDialect, infer Kind extends string>
              ? BaseRuntimeTagOf<Dialect, Kind> extends infer Runtime extends RuntimeTag
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
        : Db extends Expression.DbType.Base<infer D extends KnownDialect, infer Kind extends string>
          ? Kind extends keyof DialectKinds<D>
            ? FamilyHasTextualTrait<D, BaseFamilyOf<D, Kind>> extends true
              ? true
              : false
            : false
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
          : Source extends Expression.DbType.Base<infer SourceDialect extends KnownDialect, infer SourceKind extends string>
            ? Target extends Expression.DbType.Base<infer TargetDialect extends KnownDialect, infer TargetKind extends string>
              ? SourceDialect extends TargetDialect
                ? SourceKind extends keyof DialectKinds<SourceDialect>
                  ? TargetKind extends keyof DialectKinds<TargetDialect>
                    ? BaseFamilyOf<SourceDialect, SourceKind> extends ExactKindFamily
                      ? BaseFamilyOf<SourceDialect, TargetKind> extends "text"
                        ? FamilyCastTargets<SourceDialect, Extract<BaseFamilyOf<SourceDialect, SourceKind>, string>> extends infer Targets extends string
                          ? "text" extends Targets
                            ? true
                            : false
                          : false
                        : false
                      : BaseFamilyOf<SourceDialect, TargetKind> extends FamilyCastTargets<
                          SourceDialect,
                          Extract<BaseFamilyOf<SourceDialect, SourceKind>, string>
                        >
                        ? true
                        : false
                    : false
                  : false
                : false
              : false
            : false
    : false
  : false
