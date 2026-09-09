import type { portableDatatypeDdlTypeByDialect, postgresAdditionalCastTargets, postgresStringCastKinds, postgresAdditionalComparisonTargets, postgresNonComparableKinds, mysqlUnsupportedCastKinds } from "./matrix.js"
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
  Db extends { readonly castTargets: infer Targets extends readonly string[] }
    ? Targets[number]
    : never

type BaseImplicitTargetsOf<Db extends Expression.DbType.Base<any, any>> =
  Db extends { readonly implicitTargets: infer Targets extends readonly string[] }
    ? Targets[number]
    : never

type IsCustomBaseDbType<Db extends Expression.DbType.Any> =
  Db extends Expression.DbType.Json<any, any>
    | Expression.DbType.Array<any, any, any>
    | Expression.DbType.Range<any, any, any>
    | Expression.DbType.Multirange<any, any, any>
    | Expression.DbType.Composite<any, any, any>
    | Expression.DbType.Enum<any, any>
    | Expression.DbType.Set<any, any>
    ? false
    : Db extends Expression.DbType.Base<any, any>
      ? Db extends { readonly family: string }
        ? false
        : true
      : false

type DbTypeCompatibleWithDialect<
  Db extends Expression.DbType.Any,
  Dialect extends string
> = Dialect extends "standard"
  ? Db extends { readonly dialect: string } ? true : false
  : Db extends { readonly dialect: Dialect | "standard" } ? true : false

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

type HaveSameComparableGroup<
  Left extends Expression.DbType.Any,
  Right extends Expression.DbType.Any
> = CompareGroupOfDbType<Left> extends never
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

export type CanImplicitlyConvertDbType<
  Source extends Expression.DbType.Any,
  Target extends Expression.DbType.Any,
  Dialect extends string
> = DbTypeCompatibleWithDialect<Source, Dialect> extends true
  ? DbTypeCompatibleWithDialect<Target, Dialect> extends true
    ? Source extends Expression.DbType.Domain<any, infer Base extends Expression.DbType.Any, any>
      ? CanImplicitlyConvertDbType<Base, Target, Dialect>
      : Target extends Expression.DbType.Domain<any, infer TargetBase extends Expression.DbType.Any, any>
        ? CanImplicitlyConvertDbType<Source, TargetBase, Dialect>
        : HaveSameComparableGroup<Source, Target> extends true
          ? true
          : Source extends Expression.DbType.Base<any, any>
            ? FamilyOfDbType<Target> extends BaseImplicitTargetsOf<Source>
              ? true
              : false
            : false
    : false
  : false

type PostgresComparisonDecision<SourceKind, TargetKind> =
  [SourceKind] extends [PostgresCastKind]
    ? [TargetKind] extends [PostgresCastKind]
      ? SourceKind extends typeof postgresNonComparableKinds[number] ? false
        : [SourceKind] extends [TargetKind] ? true
          : SourceKind extends keyof typeof postgresAdditionalComparisonTargets
            ? TargetKind extends typeof postgresAdditionalComparisonTargets[SourceKind][number] ? true : false
            : false
      : "unmodeled"
    : "unmodeled"

type NativeComparisonDecision<Left extends Expression.DbType.Any, Right extends Expression.DbType.Any, Dialect extends string> =
  [Left] extends [never] ? "unmodeled" : [Right] extends [never] ? "unmodeled" :
  Exclude<Dialect, "standard"> extends "postgres"
    ? Left extends Expression.DbType.Array<any, infer LeftElement extends Expression.DbType.Any, any>
      ? Right extends Expression.DbType.Array<any, infer RightElement extends Expression.DbType.Any, any>
        ? CanCompareDbTypes<LeftElement, RightElement, Dialect>
        : false
      : Right extends Expression.DbType.Array<any, any, any> ? false
        : PostgresComparisonDecision<PostgresKindOf<Left>, PostgresKindOf<Right>>
    : "unmodeled"

export type CanCompareDbTypes<
  Left extends Expression.DbType.Any,
  Right extends Expression.DbType.Any,
  Dialect extends string
> = DbTypeCompatibleWithDialect<Left, Dialect> extends true
  ? DbTypeCompatibleWithDialect<Right, Dialect> extends true
    ? NativeComparisonDecision<Left, Right, Dialect> extends false ? false
      : HaveSameComparableGroup<Left, Right> extends true
      ? true
      : CanImplicitlyConvertDbType<Left, Right, Dialect> extends true
        ? true
        : CanImplicitlyConvertDbType<Right, Left, Dialect> extends true
          ? true
          : false
    : false
  : false

export type CanContainDbTypes<
  Left extends Expression.DbType.Any,
  Right extends Expression.DbType.Any,
  Dialect extends string
> = DbTypeCompatibleWithDialect<Left, Dialect> extends true
  ? DbTypeCompatibleWithDialect<Right, Dialect> extends true
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
> = DbTypeCompatibleWithDialect<Db, Dialect> extends true
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

type PostgresStringKind = typeof postgresStringCastKinds[number]
type PostgresCastKind = keyof typeof postgresAdditionalCastTargets | PostgresStringKind
type PostgresKindAlias<Name> =
  Name extends "int" | "integer" ? "int4" :
    Name extends "bigint" ? "int8" :
      Name extends "decimal" ? "numeric" :
        Name extends "real" ? "float4" :
          Name extends "boolean" ? "bool" : Name

type PostgresKindOf<Db extends Expression.DbType.Any> =
  Db extends Expression.DbType.Domain<any, infer Base extends Expression.DbType.Any, any> ? PostgresKindOf<Base> :
  Db["dialect"] extends "standard"
    ? Db["kind"] extends keyof typeof portableDatatypeDdlTypeByDialect.postgres
      ? PostgresKindAlias<typeof portableDatatypeDdlTypeByDialect.postgres[Db["kind"]]>
      : Db["kind"]
    : Db["kind"]

type PostgresCastDecision<SourceKind, TargetKind> =
  [SourceKind] extends [PostgresCastKind]
    ? [TargetKind] extends [PostgresCastKind]
      ? SourceKind extends PostgresStringKind ? true
        : TargetKind extends PostgresStringKind ? true
          : [SourceKind] extends [TargetKind] ? true
            : SourceKind extends keyof typeof postgresAdditionalCastTargets
              ? TargetKind extends typeof postgresAdditionalCastTargets[SourceKind][number] ? true : false
              : false
      : "unmodeled"
    : "unmodeled"

type NativeCastDecision<Source extends Expression.DbType.Any, Target extends Expression.DbType.Any, Dialect extends string> =
  Exclude<Dialect, "standard"> extends "postgres"
    ? PostgresCastDecision<PostgresKindOf<Source>, PostgresKindOf<Target>>
    : Exclude<Dialect, "standard"> extends "mysql"
      ? Target["kind"] extends typeof mysqlUnsupportedCastKinds[number] ? false : "unmodeled"
      : "unmodeled"

type StructuredDb =
  | Expression.DbType.Array<any, any, any>
  | Expression.DbType.Range<any, any, any>
  | Expression.DbType.Multirange<any, any, any>
  | Expression.DbType.Composite<any, any, any>
  | Expression.DbType.Enum<any, any>
  | Expression.DbType.Set<any, any>

type PostgresStructuredCast<Source extends Expression.DbType.Any, Target extends Expression.DbType.Any> =
  Source extends Expression.DbType.Array<any, infer SourceElement extends Expression.DbType.Any, any>
    ? Target extends Expression.DbType.Array<any, infer TargetElement extends Expression.DbType.Any, any>
      ? CanCastDbType<SourceElement, TargetElement, "postgres">
      : PostgresKindOf<Target> extends PostgresStringKind ? true : false
    : Source extends StructuredDb
      ? PostgresKindOf<Target> extends PostgresStringKind ? true
        : Target extends StructuredDb ? [Source["kind"]] extends [Target["kind"]] ? true : false
          : false
      : Target extends StructuredDb
        ? PostgresKindOf<Source> extends PostgresStringKind | "null" ? true : false
        : "unmodeled"

type NativeStructuredCast<Source extends Expression.DbType.Any, Target extends Expression.DbType.Any, Dialect extends string> =
  Exclude<Dialect, "standard"> extends "postgres" ? PostgresStructuredCast<Source, Target> : "unmodeled"

export type CanCastDbType<
  Source extends Expression.DbType.Any,
  Target extends Expression.DbType.Any,
  Dialect extends string
> = DbTypeCompatibleWithDialect<Source, Dialect> extends true
  ? DbTypeCompatibleWithDialect<Target, Dialect> extends true
    ? Source extends Expression.DbType.Domain<any, infer Base extends Expression.DbType.Any, any>
      ? CanCastDbType<Base, Target, Dialect>
      : Target extends Expression.DbType.Domain<any, infer TargetBase extends Expression.DbType.Any, any>
        ? CanCastDbType<Source, TargetBase, Dialect>
        : NativeCastDecision<Source, Target, Dialect> extends boolean
          ? NativeCastDecision<Source, Target, Dialect>
        : IsCustomBaseDbType<Source> extends true
          ? true
          : IsCustomBaseDbType<Target> extends true
            ? true
            : NativeStructuredCast<Source, Target, Dialect> extends boolean
              ? NativeStructuredCast<Source, Target, Dialect>
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
                ? FamilyOfDbType<Target> extends ExactKindFamily
                  ? false
                  : FamilyOfDbType<Target> extends BaseCastTargetsOf<Source>
                    ? true
                    : false
                : false
              : false
    : false
  : false
