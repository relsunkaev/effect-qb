import type * as Expression from "../../expression.ts"
import type { mysqlDatatypeFamilies, mysqlDatatypeKinds } from "../../mysql/datatypes/spec.ts"
import type { postgresDatatypeFamilies, postgresDatatypeKinds } from "../../postgres/datatypes/spec.ts"
import type { RuntimeOfTag, RuntimeTag } from "./shape.ts"

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

type RuntimeTagOf<Db extends Expression.DbType.Any> =
  Db extends Expression.DbType.Json<any, any>
    ? "unknown"
    : Db extends Expression.DbType.Base<infer Dialect extends KnownDialect, infer Kind extends string>
      ? KnownKindRuntimeTag<Dialect, Kind>
      : "unknown"

export type FamilyOfDbType<Db extends Expression.DbType.Any> =
  Db extends Expression.DbType.Base<infer Dialect extends KnownDialect, infer Kind extends string>
    ? KnownKindFamily<Dialect, Kind>
    : "other:unknown:unknown"

export type CompareGroupOfDbType<Db extends Expression.DbType.Any> =
  Db extends Expression.DbType.Base<infer Dialect extends KnownDialect, infer Kind extends string>
    ? KnownKindFamily<Dialect, Kind> extends infer Family extends string
      ? Family extends keyof DialectFamilies<Dialect>
        ? DialectFamilies<Dialect>[Family] extends { readonly compareGroup: infer CompareGroup extends string }
          ? CompareGroup
          : never
        : Family
      : never
    : "other:unknown:unknown"

export type RuntimeTagOfDbType<Db extends Expression.DbType.Any> = RuntimeTagOf<Db>

export type RuntimeOfDbType<Db extends Expression.DbType.Any> =
  RuntimeOfTag<RuntimeTagOfDbType<Db>>

export type CanCompareDbTypes<
  Left extends Expression.DbType.Any,
  Right extends Expression.DbType.Any,
  Dialect extends string
> = Left extends { readonly dialect: Dialect }
  ? Right extends { readonly dialect: Dialect }
    ? CompareGroupOfDbType<Left> extends "null"
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

export type CanTextuallyCoerceDbType<
  Db extends Expression.DbType.Any,
  Dialect extends string
> = Db extends { readonly dialect: Dialect }
  ? FamilyHasTextualTrait<
      Extract<Db["dialect"], KnownDialect>,
      Extract<FamilyOfDbType<Db>, string>
    > extends true
    ? true
    : false
  : false

export type CanCastDbType<
  Source extends Expression.DbType.Any,
  Target extends Expression.DbType.Any,
  Dialect extends string
> = Source extends { readonly dialect: Dialect }
  ? Target extends { readonly dialect: Dialect }
      ? CompareGroupOfDbType<Target> extends "null"
        ? false
        : Source extends Expression.DbType.Base<infer SourceDialect extends KnownDialect, string>
          ? Target extends Expression.DbType.Base<KnownDialect, string>
            ? FamilyOfDbType<Target> extends FamilyCastTargets<
                SourceDialect,
                Extract<FamilyOfDbType<Source>, string>
              >
            ? true
            : false
          : false
        : false
    : false
  : false
