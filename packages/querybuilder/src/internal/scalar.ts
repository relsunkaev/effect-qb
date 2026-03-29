import type { Pipeable } from "effect/Pipeable"
import type * as Schema from "effect/Schema"
import type { RuntimeOfDbType as RuntimeOfDbTypeLookup } from "./datatypes/lookup.js"
import type { DatatypeTraits, RuntimeTag } from "./datatypes/shape.js"

export type {
  BigIntString,
  DecimalString,
  InstantString,
  JsonPrimitive,
  JsonValue,
  LocalDateString,
  LocalDateTimeString,
  LocalTimeString,
  OffsetTimeString,
  YearString
} from "./runtime/value.js"

/** Symbol used to attach expression metadata to runtime values. */
export const TypeId: unique symbol = Symbol.for("effect-qb/Expression")

export type TypeId = typeof TypeId

/** Scope-local binding identifier used for dependency tracking. */
export type BindingId = string
/**
 * Three-state nullability lattice.
 *
 * `"never"` means non-null, `"maybe"` means nullable, and `"always"` means the
 * expression is known to be `null`.
 */
export type Nullability = "never" | "maybe" | "always"

/**
 * High-level classification of an expression.
 *
 * - `scalar`: regular per-row expression
 * - `aggregate`: grouped expression such as `count(*)`
 * - `window`: windowed expression such as `row_number() over (...)`
 */
export type ScalarKind = "scalar" | "aggregate" | "window"

/** Database-type descriptors carried alongside decoded runtime types. */
export declare namespace DbType {
  /** Base SQL type descriptor. */
  export interface Base<Dialect extends string, Kind extends string> {
    readonly dialect: Dialect
    readonly kind: Kind
    readonly family?: string
    readonly runtime?: RuntimeTag
    readonly compareGroup?: string
    readonly castTargets?: readonly string[]
    readonly traits?: DatatypeTraits
  }

  /** JSON-like database type. */
  export interface Json<
    Dialect extends string = string,
    SchemaName extends string = "json"
  > extends Base<Dialect, SchemaName>
  {
    readonly variant: SchemaName extends "jsonb" ? "jsonb" : "json"
  }

  /** Array database type. */
  export interface Array<
    Dialect extends string = string,
    Element extends Any = any,
    Kind extends string = string
  > extends Base<Dialect, Kind> {
    readonly element: Element
  }

  /** Range database type. */
  export interface Range<
    Dialect extends string = string,
    Subtype extends Any = any,
    Kind extends string = string
  > extends Base<Dialect, Kind> {
    readonly subtype: Subtype
  }

  /** Multirange database type. */
  export interface Multirange<
    Dialect extends string = string,
    Subtype extends Any = any,
    Kind extends string = string
  > extends Base<Dialect, Kind> {
    readonly subtype: Subtype
  }

  /** Composite/record database type. */
  export interface Composite<
    Dialect extends string = string,
    Fields extends Record<string, Any> = Record<string, any>,
    Kind extends string = string
  > extends Base<Dialect, Kind> {
    readonly fields: Fields
  }

  /** Named domain database type. */
  export interface Domain<
    Dialect extends string = string,
    BaseType extends Any = any,
    Kind extends string = string
  > extends Base<Dialect, Kind> {
    readonly base: BaseType
  }

  /** Enumeration database type. */
  export interface Enum<
    Dialect extends string = string,
    Kind extends string = string
  > extends Base<Dialect, Kind> {
    readonly variant: "enum"
  }

  /** Set database type. */
  export interface Set<
    Dialect extends string = string,
    Kind extends string = string
  > extends Base<Dialect, Kind> {
    readonly variant: "set"
  }

  export type Any =
    | Json
    | Base<string, string>
    | Array<string, any, string>
    | Range<string, any, string>
    | Multirange<string, any, string>
    | Composite<string, Record<string, any>, string>
    | Domain<string, any, string>
    | Enum<string, string>
    | Set<string, string>
  }

/** Canonical static metadata stored on an expression. */
export interface State<
  Runtime,
  Db extends DbType.Any,
  Nullable extends Nullability,
  Dialect extends string,
  Kind extends ScalarKind,
  Deps extends BindingId = never
> {
  readonly runtime: Runtime
  readonly dbType: Db
  readonly runtimeSchema?: Schema.Schema.Any
  readonly nullability: Nullable
  readonly dialect: Dialect
  readonly kind: Kind
  readonly dependencies: Record<string, true>
}

/**
 * A typed scalar SQL expression.
 *
 * `Runtime` is the decoded TypeScript type while `Db` captures the SQL-level
 * type identity. Both are needed: multiple SQL types may decode to the same
 * runtime type but still have different comparison/cast semantics.
 */
export interface Scalar<
  Runtime,
  Db extends DbType.Any,
  Nullable extends Nullability = "never",
  Dialect extends string = Db["dialect"],
  Kind extends ScalarKind = "scalar",
  Deps extends BindingId = never,
  GroupKey extends string = string
> extends Pipeable {
  readonly [TypeId]: State<Runtime, Db, Nullable, Dialect, Kind, Deps>
}

/** Convenience alias for any expression-like value. */
export type Any = Scalar<any, DbType.Any, Nullability, string, ScalarKind, BindingId, string>
/** Extracts an expression's decoded runtime type. */
export type RuntimeOf<Value extends Any> = Value[typeof TypeId]["runtime"]
/** Extracts an expression's database-type descriptor. */
export type DbTypeOf<Value extends Any> = Value[typeof TypeId]["dbType"]
/** Extracts an expression's nullability state. */
export type NullabilityOf<Value extends Any> = Value[typeof TypeId]["nullability"]
/** Extracts an expression's kind. */
export type KindOf<Value extends Any> = Value[typeof TypeId]["kind"]
/** Extracts an expression's source dependency union. */
export type DependenciesOf<Value extends Any> = Value extends Scalar<any, any, any, any, any, infer Deps> ? Deps : never
/** Extracts an expression's grouping identity. */
export type GroupKeyOf<Value extends Any> = Value extends Scalar<any, any, any, any, any, any, infer GroupKey> ? GroupKey : never

/** Maps a database type descriptor back to its decoded runtime type. */
export type RuntimeOfDbType<Db extends DbType.Any> = RuntimeOfDbTypeLookup<Db>
