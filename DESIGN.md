# Effect-SQL Type System Design Specification

**Version:** 1.0.0  
**Date:** 2025-11-11  
**Status:** Design Phase

---

## Table of Contents

1. [Overview](#overview)
2. [Design Decisions Summary](#design-decisions-summary)
3. [Core Type System Architecture](#core-type-system-architecture)
4. [Nullability System](#nullability-system)
5. [Database Identity and Dialect System](#database-identity-and-dialect-system)
6. [Table Sources and Aliasing](#table-sources-and-aliasing)
7. [Query Requirements Tracking](#query-requirements-tracking)
8. [API Design and Composability](#api-design-and-composability)
9. [Schema Definition](#schema-definition)
10. [Complete Usage Examples](#complete-usage-examples)
11. [Open Questions and Next Steps](#open-questions-and-next-steps)

---

## Overview

This document specifies the complete type system design for Effect-SQL, a composable, type-safe query builder for TypeScript. This design was created through interactive discussion and represents concrete implementation decisions based on the behavioral specification in `SPEC.md`.

### Purpose

This document serves as:
- **Implementation guide** for building the library
- **Handoff specification** for new contributors or sessions
- **Design rationale** documenting why decisions were made
- **API contract** for what users will experience

### Design Philosophy

The type system prioritizes:

1. **Maximum Type Safety**: Leverage TypeScript's type system to enforce as many invariants as possible at compile time
2. **Composability**: All operations are pure functions that compose via Effect's `pipe` operator
3. **Explicitness**: Prefer explicit over implicit; no magic behavior
4. **Developer Experience**: Types should be inferrable and error messages actionable

### Key Features

- **Database identity isolation**: Cross-database operations rejected at type level
- **Dialect compatibility tracking**: Narrowing dialect support as operations compose
- **Nullability refinement**: Type-level tracking of null refinements through predicates
- **Query requirement tracking**: Ensure all referenced tables are added to the plan
- **Foreign key awareness**: Schema-driven but explicit join predicates

---

## Design Decisions Summary

This section captures all major design decisions made during the design phase. Each decision is numbered and references the question that prompted it.

### Core Approach Decisions

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| 1 | Starting point | **Core Type System** | Foundation must be solid before building API layer |
| 2 | API style | **Functional/Piped (Effect-style)** | Consistent with Effect ecosystem, composable |
| 3 | Schema source | **Code-first** | Types flow from code to database, better DX |
| 4 | Type safety depth | **Maximum** | Enforce as many invariants as possible at compile time |

### Type System Decisions

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| 5 | Database identity branding | **Phantom type parameter** | Simple, effective, prevents cross-DB operations at type level |
| 6 | Query requirements tracking | **Required sources in type (tuple)** | Clear tracking of unfulfilled dependencies |
| 7 | Nullability encoding | **Three-state literal union** (`"never" \| "maybe" \| "always"`) | Direct mapping to spec, explicit refinement tracking |
| 8 | Schema definition | **Effect Schema integration** | Leverage existing Effect ecosystem, runtime validation |

### Dialect System Decisions

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| 9 | Dialect tracking | **`never` = cross-compatible, literals for specific** | Clear default, explicit when dialect-specific |
| 10 | Dialect narrowing | **Type parameter narrows via `Extract`** | Natural TypeScript type algebra |
| 11 | Dialect conflicts | **Compile error with descriptive message** | Fail fast, clear error messages |

### API Design Decisions

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| 12 | Column access | **Direct property access** (`table.id`) | Clean DX, natural feel |
| 13 | Required tracking | **Union of `TableSource` types** | Simple `Exclude` operations, handles duplicates |
| 14 | Pipe implementation | **Effect's Pipeable interface + `pipe` operator** | Ecosystem consistency |
| 15 | Multiple `from()` calls | **Error - only one allowed** | Explicit joins required, no ambiguity |
| 16 | Column referencing in `where` | **Both implicit and explicit** | Flexibility: implicit for simple cases, explicit for clarity |
| 17 | Table aliasing | **`.as()` method** | Intuitive, chainable, integrates with explicit sources |
| 18 | Join predicates | **Always explicit** | No magic FK inference in v1, clear semantics |

### Proposed API Style

The final API style combines functional composition with intuitive property access:

```typescript
select({ 
  id: table.id, 
  value: { 
    table1: table.value, 
    table2: table2.value 
  } 
}).pipe(
  from(table),
  innerJoin(table2, eq(table2.id, table.id)),
  where(isNotNull(table.value))
)
```

Key characteristics:
- `select()` establishes requirements (tables that must be added)
- `from()` and join operations fulfill requirements
- Type-level tracking ensures all requirements are met before execution
- Nullability refinements flow through the plan

---

## Core Type System Architecture

This section defines the fundamental types that form the foundation of the entire library. All other types build upon these primitives.

### 3.1 Expression Type

The `Expression` type represents any typed, composable term in a query - from simple column references to complex derived values.

```typescript
/**
 * Core expression type representing a typed, composable SQL term.
 * 
 * @template T - The runtime TypeScript type of the expression
 * @template N - Nullability: "never" | "maybe" | "always"
 * @template D - Supported dialect(s): never (cross-compatible) | "postgres" | "mysql" | "sqlite" | union
 * @template DB - Database identity (phantom type for isolation)
 */
type Expression<
  T,
  N extends Nullability = "maybe",
  D extends Dialect = never,
  DB = any
> = {
  readonly _tag: "Expression"
  readonly _type: T
  readonly _nullability: N
  readonly _dialect: D
  readonly _db: DB
}

/**
 * Nullability lattice values
 */
type Nullability = "never" | "maybe" | "always"

/**
 * Supported SQL dialects
 */
type Dialect = "postgres" | "mysql" | "sqlite"
```

**Key Properties:**

- **Pure**: Expressions are immutable; operations return new expressions
- **Composable**: Binary operations combine two expressions following type rules
- **Branded**: Each expression carries its database identity and dialect constraints
- **Typed**: The `T` parameter determines what TypeScript type results from decoding

**Type Parameters Explained:**

1. **`T` (Runtime Type)**: The TypeScript type that will be produced when this expression is decoded from SQL results
   - Examples: `string`, `number`, `Date`, `User` (from schema)

2. **`N` (Nullability)**: Tracks whether this expression can be null
   - `"never"`: Guaranteed non-null (e.g., `NOT NULL` column, after `isNotNull()` predicate)
   - `"maybe"`: May or may not be null (default for nullable columns)
   - `"always"`: Always null (e.g., after `isNull()` predicate - rare in projections)

3. **`D` (Dialect)**: Tracks which SQL dialects support this expression
   - `never`: Cross-compatible (works on all dialects)
   - `"postgres"`: Postgres-specific (e.g., `ILIKE`, `@>` JSONB operator)
   - `"postgres" | "mysql"`: Works on multiple but not all dialects
   - When composing, dialect narrows to intersection

4. **`DB` (Database Identity)**: Phantom type preventing cross-database operations
   - Branded using a unique symbol or literal type per database instance
   - All expressions in a plan must share the same `DB` type

### 3.2 Column Type

A `Column` is a specialized expression that references a concrete schema column and carries source provenance.

```typescript
/**
 * Column expression representing a reference to a table column.
 * Extends Expression with source tracking.
 * 
 * @template T - Column's TypeScript type
 * @template N - Column's nullability
 * @template TSource - The table source this column belongs to
 * @template DB - Database identity
 */
type Column<
  T,
  N extends Nullability,
  TSource extends TableSource<any, any>,
  DB
> = Expression<T, N, never, DB> & {
  readonly _tag: "Column"
  readonly _source: TSource
  readonly _columnName: string
}
```

**Key Properties:**

- **Source Tracking**: Knows which table (and alias) it belongs to
- **Always Cross-Compatible**: Raw column references work on all dialects (`D = never`)
- **Provenance**: Used to validate `where` clauses reference only available sources

### 3.3 Plan Type - The Universal Query Representation

**Key Insight:** A `Table` IS a `Plan`. This unification simplifies the type system dramatically.

A table like `users` is conceptually equivalent to:
```typescript
select({ id: users.id, name: users.name, ... /* all columns */ })
  .pipe(from(users))
```

This means a `Table` is just a completed `Plan` that:
- Selects all its columns
- Has no unfulfilled requirements
- Has itself in `TAvailable`

```typescript
/**
 * Logical query plan - the universal representation for queries and tables.
 * 
 * @template TSelect - Shape of the projection (result type)
 * @template TRequired - Union of TableSource types that must still be added
 * @template TAvailable - Record mapping aliases to their TableSource types
 * @template TDialect - Supported dialect(s): never or specific dialect(s)
 * @template DB - Database identity
 */
type Plan<
  TSelect,
  TRequired extends TableSource<any, any>,
  TAvailable extends Record<string, TableSource<any, any>>,
  TDialect extends Dialect,
  DB
> = Pipeable & {
  readonly _tag: "Plan"
  readonly _select: TSelect
  readonly _required: TRequired
  readonly _available: TAvailable
  readonly _dialect: TDialect
  readonly _db: DB
  
  // Direct column access (like tables)
  readonly [K in keyof TSelect]: TSelect[K] extends Expression<infer T, infer N, any, any>
    ? Column<T, N, ExtractSource<TSelect[K]>, DB>
    : never
  
  /**
   * Create an aliased version for use in FROM/JOIN.
   * Only available when plan is complete (TRequired extends never).
   */
  as<NewAlias extends string>(
    alias: NewAlias
  ): TRequired extends never
    ? Plan<TSelect, never, Record<NewAlias, TableSource<"subquery", NewAlias>>, TDialect, DB>
    : never  // Error: Cannot alias incomplete plan
}

/**
 * Helper to extract TableSource from a Column expression
 */
type ExtractSource<E> = E extends Column<any, any, infer TSource, any> ? TSource : never
```

### 3.4 Table Type - Specialized Plan

A `Table` is now just a type alias for a specific `Plan` shape:

```typescript
/**
 * Table is a completed Plan that represents a database table.
 * It's the result of defineTable() - a plan that's immediately usable.
 * 
 * @template TSchema - Record type mapping column names to their types
 * @template TSource - TableSource identity for this table reference
 * @template DB - Database identity
 */
type Table<
  TSchema extends Record<string, any>,
  TSource extends TableSource<any, any>,
  DB
> = Plan<
  TSchema,                                    // TSelect: the schema itself
  never,                                      // TRequired: already complete
  Record<TSource['alias'], TSource>,          // TAvailable: itself
  never,                                      // TDialect: cross-compatible
  DB
> & {
  readonly _tableTag: "Table"  // Marker for nominal typing
  readonly _source: TSource
  readonly _schema: TSchema
}

/**
 * Helper to infer TypeScript type from schema column definition
 */
type InferColumnType<TCol> = TCol extends { type: infer T } ? T : TCol

/**
 * Helper to infer nullability from schema column definition
 */
type InferColumnNullability<TCol> = 
  TCol extends { nullable: false } ? "never" :
  TCol extends { nullable: true } ? "maybe" :
  "maybe"  // Default
```

**Key Properties:**

- **Table IS Plan**: Tables are just a special case of plans
- **Direct Property Access**: Both tables and completed plans support `plan.columnName`
- **Aliasing**: Both support `.as(alias)` for creating new references
- **Composability**: No distinction needed in `from()` or joins - they all accept plans

The `Plan` type represents a logical query plan with all type-level safety guarantees.

```typescript
/**
 * Logical query plan with complete type-level safety.
 * 
 * @template TSelect - Shape of the projection (result type)
 * @template TRequired - Union of TableSource types that must still be added
 * @template TAvailable - Record mapping aliases to their TableSource types
 * @template TDialect - Supported dialect(s): never or specific dialect(s)
 * @template DB - Database identity
 */
type Plan<
  TSelect,
  TRequired extends TableSource<any, any>,
  TAvailable extends Record<string, TableSource<any, any>>,
  TDialect extends Dialect,
  DB
> = Pipeable & {
  readonly _tag: "Plan"
  readonly _select: TSelect
  readonly _required: TRequired
  readonly _available: TAvailable
  readonly _dialect: TDialect
  readonly _db: DB
}
```

**Type Parameters Explained:**

1. **`TSelect`**: The shape of the result when this plan executes
   - Built from the `select()` call
   - Maps selected field names to their types
   - Example: `{ id: string, name: string | null }`

2. **`TRequired`**: Union of table sources that must still be added
   - Populated by `select()` based on which columns are referenced
   - Reduced by `from()` and join operations
   - Must be `never` before plan can execute

3. **`TAvailable`**: Record of available table sources (already added to plan)
   - Keys are table aliases
   - Values are `TableSource` types
   - Used to validate `where()` and other operations reference only available tables
   - Example: `{ users: TableSource<"users", "users">, posts: TableSource<"posts", "posts"> }`

4. **`TDialect`**: Supported dialect(s)
   - Starts as `never` (cross-compatible)
   - Narrows when dialect-specific operations are used
   - Example: After using `ilike`, becomes `"postgres"`

5. **`DB`**: Database identity
   - All operations must share same database identity
   - Enforces single-database composition per spec §9

### 3.5 Unified Composition

With this unification, everything composes naturally:

```typescript
// Define a table (returns a Plan)
const users: Table<UserSchema, TableSource<"users", "users">, DB> = defineTable(...)

// Use table directly
select({ id: users.id }).pipe(from(users))

// Create a subquery (also a Plan)
const adults = select({ id: users.id, name: users.name }).pipe(
  from(users),
  where(gt(users.age, 18))
)

// Use subquery exactly like a table
select({ id: adults.id, name: adults.name }).pipe(
  from(adults.as("adults"))
)

// Nest subqueries
const level1 = select({ id: users.id }).pipe(from(users))
const level2 = select({ id: level1.id }).pipe(from(level1.as("l1")))
const level3 = select({ id: level2.id }).pipe(from(level2.as("l2")))
```

**Plan Lifecycle:**

```typescript
// 1. select() creates plan with requirements
select({ id: users.id, title: posts.title })
// Plan<{ id: Expression<...>, title: Expression<...> }, 
//      TableSource<"users"> | TableSource<"posts">, 
//      {}, 
//      never, 
//      DB>

// 2. from() fulfills first requirement
.pipe(from(users))
// Plan<..., TableSource<"posts">, { users: TableSource<"users"> }, never, DB>

// 3. join() fulfills second requirement
.pipe(innerJoin(posts, eq(posts.userId, users.id)))
// Plan<..., never, { users: ..., posts: ... }, never, DB>

// 4. Now executable (TRequired = never)
.pipe(execute)
```

### 3.5 Supporting Types

```typescript
/**
 * Table source identity with name and alias.
 * Used to track which tables are referenced and distinguish self-joins.
 */
type TableSource<
  Name extends string,
  Alias extends string = Name
> = {
  readonly name: Name
  readonly alias: Alias
}

/**
 * Extract available tables as a typed record for explicit source access.
 * Used in where((sources) => ...) pattern.
 */
type AvailableTables<
  TAvail extends Record<string, TableSource<any, any>>,
  DB
> = {
  [K in keyof TAvail]: Table<any, TAvail[K], DB>
}

/**
 * Pipeable mixin for Effect-style composition.
 * All plans implement this to work with pipe().
 */
interface Pipeable {
  pipe<A>(fn: (self: this) => A): A
  pipe<A, B>(fn1: (self: this) => A, fn2: (a: A) => B): B
  pipe<A, B, C>(fn1: (self: this) => A, fn2: (a: A) => B, fn3: (b: B) => C): C
  // ... more overloads
}
```

### 3.6 Type Relationships Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                          Plan                               │
│  • Tracks TSelect (result shape)                            │
│  • Tracks TRequired (unfulfilled dependencies)              │
│  • Tracks TAvailable (sources in scope)                     │
│  • Tracks TDialect (supported dialects)                     │
│  • Tracks DB (database identity)                            │
└────────────┬────────────────────────────────────────────────┘
             │ contains
             ▼
    ┌────────────────┐
    │   Expression   │◄─────────────┐
    │  • Type T      │               │ specializes
    │  • Nullability │               │
    │  • Dialect     │         ┌─────┴─────┐
    │  • DB identity │         │  Column   │
    └────────────────┘         │  • Source │
             ▲                 └───────────┘
             │                       │
             │                       │ belongs to
             │                       ▼
             │                 ┌──────────┐
             │                 │  Table   │
             │                 │ • Schema │
             │                 │ • Source │
             └─────references──┤ • DB     │
                               └──────────┘
                                     │
                                     │ identified by
                                     ▼
                               ┌──────────────┐
                               │ TableSource  │
                               │ • Name       │
                               │ • Alias      │
                               └──────────────┘
```

### 3.7 Type Invariants

These invariants must hold at all times:

1. **Database Identity Consistency**: All expressions in a plan share the same `DB` type
2. **Dialect Intersection**: Composing expressions narrows dialect support (never widens)
3. **Requirement Fulfillment**: A plan can only execute when `TRequired extends never`
4. **Source Availability**: Operations can only reference sources in `TAvailable`
5. **Nullability Monotonicity**: Refinements can only narrow nullability, never widen it arbitrarily

---

## Nullability System

The nullability system implements the three-state lattice defined in SPEC.md §6-7, tracking null-safety through type-level refinements.

### 4.1 Nullability Lattice

```typescript
/**
 * Three-state nullability lattice.
 * Represents all possible null states an expression can be in.
 */
type Nullability = "never" | "maybe" | "always"
```

**State Definitions:**

- **`"never"`**: Expression is guaranteed non-null
  - Examples: `NOT NULL` column, after `isNotNull()` predicate, `COUNT(*)` aggregate
  - Can be safely accessed without null checks
  - TypeScript type: `T` (not `T | null`)

- **`"maybe"`**: Expression may or may not be null
  - Examples: Nullable column, most binary operations with nullable operands
  - Default state for nullable columns
  - TypeScript type: `T | null`

- **`"always"`**: Expression is guaranteed null
  - Examples: After `isNull()` predicate
  - Rare in projections (projecting always-null is typically meaningless)
  - TypeScript type: `null`

**Lattice Properties:**

The nullability states form a lattice with the following ordering:
```
    "always"
        ↑
     "maybe"
        ↑
     "never"
```

Operations can only move "up" the lattice (toward more nullable) or stay at the same level. Refinements can move "down" (toward less nullable).

### 4.2 Join Nullability Rules (SPEC.md §6)

Join operations transform nullability according to their semantics:

```typescript
/**
 * Type-level nullability transformation for joins
 */
type JoinNullability<
  JoinType extends "inner" | "left" | "right" | "full",
  Side extends "left" | "right",
  N extends Nullability
> = 
  JoinType extends "inner" ? N :  // Inner join preserves nullability
  JoinType extends "left" ? 
    Side extends "right" ? "maybe" : N :  // Left join: right side becomes maybe
  JoinType extends "right" ?
    Side extends "left" ? "maybe" : N :   // Right join: left side becomes maybe
  "maybe"  // Full join: both sides become maybe
```

**Examples:**

```typescript
// Inner join - nullability preserved
users.name  // Expression<string, "maybe", never, DB>
  .pipe(innerJoin(posts, ...))
users.name  // Still Expression<string, "maybe", never, DB>

// Left join - right side becomes maybe
posts.title  // Expression<string, "never", never, DB> (NOT NULL column)
  .pipe(leftJoin(posts, ...))
posts.title  // Now Expression<string, "maybe", never, DB>

// Full join - both sides become maybe
users.id    // Expression<string, "never", never, DB>
posts.id    // Expression<string, "never", never, DB>
  .pipe(fullJoin(...))
users.id    // Expression<string, "maybe", never, DB>
posts.id    // Expression<string, "maybe", never, DB>
```

### 4.3 Predicate Refinement Rules (SPEC.md §6)

Predicates refine nullability for the remainder of the plan:

```typescript
/**
 * IS NOT NULL predicate refines to "never"
 */
function isNotNull<T, N extends Nullability, D extends Dialect, DB>(
  expr: Expression<T, N, D, DB>
): Expression<boolean, "never", D, DB> & {
  readonly _refinement: {
    readonly expr: Expression<T, N, D, DB>
    readonly to: "never"
  }
}

/**
 * IS NULL predicate refines to "always"
 */
function isNull<T, N extends Nullability, D extends Dialect, DB>(
  expr: Expression<T, N, D, DB>
): Expression<boolean, "never", D, DB> & {
  readonly _refinement: {
    readonly expr: Expression<T, N, D, DB>
    readonly to: "always"
  }
}

/**
 * Equality predicate between two expressions refines both to "never"
 * (SQL equality eliminates NULL rows by definition)
 */
function eq<T, N1 extends Nullability, N2 extends Nullability, D extends Dialect, DB>(
  left: Expression<T, N1, D, DB>,
  right: Expression<T, N2, D, DB>
): Expression<boolean, "maybe", D, DB> & {
  readonly _refinement: {
    readonly left: Expression<T, N1, D, DB>
    readonly right: Expression<T, N2, D, DB>
    readonly to: "never"
  }
}
```

**Refinement Application:**

When a predicate with refinements is used in `where()`, the plan applies the refinements:

```typescript
const query = select({ 
  name: users.name  // Expression<string, "maybe", ...>
}).pipe(
  from(users),
  where(isNotNull(users.name))
)

// After where(), in the plan's type system:
// users.name is now Expression<string, "never", ...>
// Result type is { name: string } (not string | null)
```

**Implementation Detail:**

The plan maintains a refinement map tracking which expressions have been refined:

```typescript
type RefinementMap = Map<
  Expression<any, any, any, any>,  // The refined expression
  Nullability  // Its new nullability state
>
```

When projecting, the plan checks the refinement map to determine final nullability.

### 4.4 Binary Operation Nullability

Binary operations propagate nullability conservatively:

```typescript
/**
 * Binary operation nullability: if any operand is nullable, result is nullable
 */
type BinaryOpNullability<N1 extends Nullability, N2 extends Nullability> =
  N1 extends "always" ? "always" :
  N2 extends "always" ? "always" :
  N1 extends "maybe" ? "maybe" :
  N2 extends "maybe" ? "maybe" :
  "never"

// Examples:
// "never" + "never" = "never"  ✓ Both non-null → result non-null
// "never" + "maybe" = "maybe"  ✓ One nullable → result nullable
// "maybe" + "maybe" = "maybe"  ✓ Both nullable → result nullable
// "always" + "never" = "always" ✓ One always null → result always null
```

**Arithmetic Example:**

```typescript
function add<T extends number, N1 extends Nullability, N2 extends Nullability, D, DB>(
  left: Expression<T, N1, D, DB>,
  right: Expression<T, N2, D, DB>
): Expression<T, BinaryOpNullability<N1, N2>, D, DB>

// Usage:
const a: Expression<number, "never", never, DB> = users.age  // NOT NULL
const b: Expression<number, "maybe", never, DB> = users.salary  // nullable

const sum = add(a, b)  // Expression<number, "maybe", never, DB>
```

### 4.5 Aggregate Nullability (SPEC.md §7)

Aggregates define their nullability explicitly:

```typescript
/**
 * COUNT(*) is never null (always returns a number, minimum 0)
 */
function count<T, N extends Nullability, D, DB>(
  expr: Expression<T, N, D, DB>
): Expression<number, "never", D, DB>

/**
 * MIN/MAX/SUM/AVG can return null if:
 * - Input is nullable, OR
 * - No rows match (aggregate over empty set)
 * 
 * Result is "maybe" unless we can prove non-empty set
 */
function min<T extends number | Date, N extends Nullability, D, DB>(
  expr: Expression<T, N, D, DB>
): Expression<T, "maybe", D, DB>

function max<T extends number | Date, N extends Nullability, D, DB>(
  expr: Expression<T, N, D, DB>
): Expression<T, "maybe", D, DB>

/**
 * COALESCE: never-null if any argument is never-null
 */
function coalesce<T, N1 extends Nullability, N2 extends Nullability, D, DB>(
  expr1: Expression<T, N1, D, DB>,
  expr2: Expression<T, N2, D, DB>
): Expression<T, CoalesceNullability<N1, N2>, D, DB>

type CoalesceNullability<N1 extends Nullability, N2 extends Nullability> =
  N1 extends "never" ? "never" :
  N2 extends "never" ? "never" :
  N1 extends "maybe" ? N2 :  // If first is maybe, second determines
  "always"  // Both always-null → always-null
```

### 4.6 Contradictory Refinements

Attempting to refine to mutually exclusive states is rejected at compile time:

```typescript
const query = select({ id: users.id }).pipe(
  from(users),
  where(isNotNull(users.email)),  // email is now "never"
  where(isNull(users.email))      // ❌ Type error: already refined to "never"
)
```

**Error Message:**
```
Type error: Cannot refine expression to "always" - already refined to "never"
Expression: users.email
Current nullability: "never"
Attempted refinement: "always"
```

### 4.7 Nullability in Result Types

When a plan is executed, the result type reflects refined nullability:

```typescript
type DecodeNullability<T, N extends Nullability> =
  N extends "never" ? T :
  N extends "always" ? null :
  T | null

type DecodeResult<TSelect> = {
  [K in keyof TSelect]: TSelect[K] extends Expression<infer T, infer N, any, any>
    ? DecodeNullability<T, N>
    : never
}

// Example:
const plan = select({
  id: users.id,           // Expression<string, "never", ...>
  name: users.name,       // Expression<string, "maybe", ...>
}).pipe(
  from(users),
  where(isNotNull(users.name))  // Refines name to "never"
)

type Result = DecodeResult<typeof plan['_select']>
// { id: string, name: string }
// Note: name is string, not string | null, due to refinement
```

### 4.8 Nullability Transformation Summary

| Operation | Input Nullability | Output Nullability | Note |
|-----------|-------------------|-------------------|------|
| `isNotNull(expr)` | `N` | Refines `expr` to `"never"` | Predicate guarantees non-null |
| `isNull(expr)` | `N` | Refines `expr` to `"always"` | Predicate guarantees null |
| `eq(a, b)` | `N1`, `N2` | Refines both to `"never"` | SQL equality eliminates nulls |
| Inner join | `N` | `N` (preserved) | No nullability change |
| Left join (right side) | `N` | `"maybe"` | Right side may not match |
| Right join (left side) | `N` | `"maybe"` | Left side may not match |
| Full join | `N` | `"maybe"` | Both sides may not match |
| Binary op (`+`, `-`, etc.) | `N1`, `N2` | `BinaryOpNullability<N1, N2>` | Conservative propagation |
| `count(*)` | - | `"never"` | Always returns number |
| `min/max/sum/avg` | `N` | `"maybe"` | Can be null if empty set |
| `coalesce(a, b)` | `N1`, `N2` | `"never"` if either is `"never"` | Fallback logic |

---

## Database Identity and Dialect System

This section specifies how database identity isolation and dialect compatibility tracking are enforced at the type level.

### 5.1 Database Identity (SPEC.md §9)

**Purpose:** Prevent cross-database composition at compile time.

Every expression, column, table, and plan carries a phantom type parameter `DB` that represents its database identity. Operations reject attempts to combine different identities.

#### 5.1.1 Database Identity Branding

```typescript
/**
 * Database identity phantom type.
 * Each database instance gets a unique brand.
 */
declare const DatabaseIdBrand: unique symbol

type DatabaseId<Name extends string = string> = {
  readonly [DatabaseIdBrand]: Name
}

/**
 * Create a branded database identity.
 * Called when establishing a database connection.
 */
function createDatabaseId<Name extends string>(name: Name): DatabaseId<Name> {
  return { [DatabaseIdBrand]: name } as any
}

// Usage:
const db1 = createDatabaseId("primary")    // DatabaseId<"primary">
const db2 = createDatabaseId("analytics")  // DatabaseId<"analytics">
```

**Key Properties:**

- Each database gets a unique type-level identity
- Identity is a phantom type (not checked at runtime, only at compile time)
- Cross-database operations fail at type-checking time

#### 5.1.2 Database Identity in Types

All core types carry the `DB` parameter:

```typescript
type Expression<T, N, D, DB> = { ... }
type Column<T, N, TSource, DB> = { ... }
type Table<TSchema, TSource, DB> = { ... }
type Plan<TSelect, TRequired, TAvailable, TDialect, DB> = { ... }
```

#### 5.1.3 Cross-Database Rejection

```typescript
// Two databases
const usersTable1 = defineTable(db1, "users", ...)  // Table<..., DB1>
const postsTable2 = defineTable(db2, "posts", ...)  // Table<..., DB2>

// Attempt to join across databases
const query = select({
  userName: usersTable1.name,
  postTitle: postsTable2.title  // ❌ Type error: DB1 ≠ DB2
}).pipe(
  from(usersTable1),
  innerJoin(postsTable2, ...)  // ❌ Type error: DB1 ≠ DB2
)
```

**Error Message:**
```
Type error: Cannot compose expressions from different databases
Expression 1 database: DatabaseId<"primary">
Expression 2 database: DatabaseId<"analytics">

Cross-database operations are not permitted per SPEC.md §9.
Consider materializing results from one database before querying the other.
```

#### 5.1.4 Transaction Scope

Transactions are bound to a single database identity:

```typescript
function transaction<R, E, DB>(
  db: DatabaseConnection<DB>,
  f: (tx: Transaction<DB>) => Effect<R, E, any>
): Effect<R, E, any>

// Any plan executed within the transaction must match DB
function execute<TSelect, TAvail, DB>(
  plan: Plan<TSelect, never, TAvail, any, DB>
): Effect<DecodeResult<TSelect>, SqlError, DatabaseConnection<DB>>
```

### 5.2 Dialect System (SPEC.md §8)

**Purpose:** Track which SQL dialects support each expression, narrowing compatibility as operations compose.

#### 5.2.1 Dialect Type

```typescript
/**
 * Supported SQL dialects
 */
type Dialect = "postgres" | "mysql" | "sqlite"

/**
 * Dialect compatibility in expressions:
 * - never = cross-compatible (works on all dialects)
 * - specific literal = only works on that dialect
 * - union = works on multiple specific dialects
 */
type DialectConstraint = never | Dialect
```

**Key Design Decision:**

- **`never` = cross-compatible**: Expressions start with `D = never`, meaning they work everywhere
- **Specific dialect narrows**: Using a dialect-specific feature changes `D` from `never` to that dialect
- **Intersection on composition**: Composing expressions takes the intersection of their dialect support

#### 5.2.2 Dialect Narrowing

```typescript
/**
 * Dialect intersection: when composing two expressions,
 * result supports only dialects both support.
 */
type IntersectDialect<D1 extends DialectConstraint, D2 extends DialectConstraint> =
  D1 extends never ? D2 :  // never ∩ D2 = D2 (never is universal)
  D2 extends never ? D1 :  // D1 ∩ never = D1
  Extract<D1, D2>          // D1 ∩ D2 = their intersection

// Examples:
// IntersectDialect<never, "postgres"> = "postgres"
// IntersectDialect<"postgres", never> = "postgres"
// IntersectDialect<"postgres" | "mysql", "mysql"> = "mysql"
// IntersectDialect<"postgres", "mysql"> = never (no overlap → compile error!)
```

#### 5.2.3 Dialect-Specific Operations

Operations can be dialect-specific:

```typescript
/**
 * ILIKE operator - PostgreSQL only
 */
function ilike<T, N extends Nullability, D extends DialectConstraint, DB>(
  expr: Expression<T, N, D, DB>,
  pattern: string
): Expression<boolean, "maybe", Extract<D, "postgres">, DB>

// Usage:
const query = select({ name: users.name }).pipe(
  from(users),
  where(ilike(users.name, "%john%"))  // Dialect narrows to "postgres"
)
// query has type: Plan<..., ..., ..., "postgres", DB>

// Attempting to execute on MySQL:
const mysqlExecutor: Executor<"mysql", DB> = ...
execute(mysqlExecutor, query)  
// ❌ Type error: Plan requires "postgres", executor is "mysql"
```

#### 5.2.4 Dialect Conflict Detection

If dialect narrows to an empty intersection, compilation fails:

```typescript
const query = select({ name: users.name }).pipe(
  from(users),
  where(ilike(users.name, "%john%")),  // Narrows to "postgres"
  where(regexpLike(users.email, ".*@.*"))  // MySQL-specific
  // ❌ Type error: Extract<"postgres", "mysql"> = never
)
```

**Error Message:**
```
Type error: Dialect conflict - no compatible dialects remain
Current dialect: "postgres"
Attempted operation: regexpLike (requires "mysql")
Result: Extract<"postgres", "mysql"> = never

Cannot compose operations from incompatible dialects.
Already using postgres dialect, can't use mysql features.
```

#### 5.2.5 Executor Compatibility

Executors are bound to a specific dialect and database:

```typescript
/**
 * Executor bound to specific dialect and database
 */
type Executor<D extends Dialect, DB> = {
  readonly dialect: D
  readonly db: DB
  
  execute<TSelect, TAvail>(
    plan: Plan<TSelect, never, TAvail, D, DB>  // Must match D and DB!
  ): Effect<DecodeResult<TSelect>, SqlError, any>
}

// Create executors
const pgExecutor: Executor<"postgres", typeof db1> = createExecutor(db1, "postgres")
const mysqlExecutor: Executor<"mysql", typeof db2> = createExecutor(db2, "mysql")

// Cross-compatible plan works on both
const crossCompatQuery: Plan<..., ..., ..., never, typeof db1> = ...
pgExecutor.execute(crossCompatQuery)  // ✓ Works (never ⊆ "postgres")

// Postgres-specific plan only works on Postgres
const pgQuery: Plan<..., ..., ..., "postgres", typeof db1> = ...
pgExecutor.execute(pgQuery)      // ✓ Works
mysqlExecutor.execute(pgQuery)   // ❌ Type error: dialect mismatch
```

#### 5.2.6 Dialect Introspection

Plans can be introspected to determine dialect requirements:

```typescript
type GetDialect<TPlan> = 
  TPlan extends Plan<any, any, any, infer D, any> ? D : never

const query = select({ ... }).pipe(
  from(users),
  where(ilike(users.name, "%test%"))
)

type QueryDialect = GetDialect<typeof query>  // "postgres"

// Runtime introspection:
function getSupportedDialects(plan: Plan<any, any, any, any, any>): Dialect[] {
  // Returns runtime dialect info for diagnostics
}
```

### 5.3 Combined DB + Dialect Enforcement

Both constraints work together:

```typescript
function binaryOp<T, N1, N2, D1, D2, DB1, DB2>(
  left: Expression<T, N1, D1, DB1>,
  right: Expression<T, N2, D2, DB2>
): Expression<
  T,
  BinaryOpNullability<N1, N2>,
  IntersectDialect<D1, D2>,
  DB1 & DB2  // Intersection type - only works if DB1 = DB2
>

// If DB1 ≠ DB2, the intersection is never, causing a type error
```

### 5.4 Dialect Feature Matrix

| Feature | Postgres | MySQL | SQLite | Type Signature |
|---------|----------|-------|--------|----------------|
| `eq`, `gt`, `lt` | ✓ | ✓ | ✓ | `D` (preserved) |
| `and`, `or`, `not` | ✓ | ✓ | ✓ | `D` (preserved) |
| `like` | ✓ | ✓ | ✓ | `D` (preserved) |
| `ilike` | ✓ | ✗ | ✗ | `Extract<D, "postgres">` |
| `regexpLike` | ✗ | ✓ | ✗ | `Extract<D, "mysql">` |
| `@>` (JSONB contains) | ✓ | ✗ | ✗ | `Extract<D, "postgres">` |
| `JSON_EXTRACT` | ✗ | ✓ | ✓ | `Extract<D, "mysql" \| "sqlite">` |
| `RETURNING` clause | ✓ | ✗ | ✓ | `Extract<D, "postgres" \| "sqlite">` |

### 5.5 Dialect Policy

**Default Stance:** Write cross-compatible queries by default. Opt into dialect-specific features explicitly.

**Best Practices:**

1. **Start cross-compatible**: Use `never` dialect features
2. **Narrow intentionally**: Only use dialect-specific features when necessary
3. **Document dialect requirements**: Make it clear when a query requires a specific dialect
4. **Test across dialects**: If claiming cross-compatibility, test on all supported dialects

**Example:**

```typescript
// ✓ Good: Cross-compatible
const query = select({ name: users.name }).pipe(
  from(users),
  where(eq(users.status, "active"))  // Works everywhere
)

// ✓ Good: Explicitly Postgres-specific
const pgQuery = select({ name: users.name }).pipe(
  from(users),
  where(ilike(users.name, "%john%"))  // Clearly Postgres-only
)

// ✗ Bad: Accidentally dialect-specific without realizing
const oopsQuery = select({ data: users.jsonData }).pipe(
  from(users),
  where(jsonContains(users.jsonData, { key: "value" }))  // Postgres-only!
)
// Better: Document or provide cross-compatible alternative
```

---

## Table Sources and Aliasing

This section specifies how tables are identified, referenced, and aliased to support self-joins and explicit source tracking.

### 6.1 TableSource Type

The `TableSource` type provides identity for table references:

```typescript
/**
 * Table source identity with name and alias.
 * 
 * @template Name - The actual table name in the database
 * @template Alias - The alias used in the query (defaults to Name)
 */
type TableSource<
  Name extends string,
  Alias extends string = Name
> = {
  readonly name: Name
  readonly alias: Alias
}
```

**Key Properties:**

- **Name**: The actual table name in the database schema
- **Alias**: The name used to reference this table in the query
- **Defaults**: If no alias is provided, alias = name
- **Identity**: Each unique `TableSource` type is a distinct identity

**Examples:**

```typescript
type UsersSource = TableSource<"users", "users">      // Default: alias = name
type ManagersSource = TableSource<"users", "managers"> // Self-join: same table, different alias
type PostsSource = TableSource<"posts", "posts">
```

### 6.2 Table References

Tables are created with a source identity:

```typescript
/**
 * Create a table reference from a schema
 */
function defineTable<
  Name extends string,
  TSchema extends Record<string, any>,
  DB
>(
  db: DatabaseConnection<DB>,
  name: Name,
  schema: TSchema
): Table<TSchema, TableSource<Name, Name>, DB>

// Usage:
const users = defineTable(db, "users", UserSchema)
// Type: Table<UserSchema, TableSource<"users", "users">, DB>

const posts = defineTable(db, "posts", PostSchema)
// Type: Table<PostSchema, TableSource<"posts", "posts">, DB>
```

**Default Behavior:**

- Alias defaults to table name
- Each table reference has source identity matching its name
- Ready to use in queries without explicit aliasing

### 6.3 Aliasing with .as()

The `.as()` method creates an aliased version of a table:

```typescript
/**
 * Table.as() method signature
 */
interface Table<TSchema, TSource extends TableSource<any, any>, DB> {
  as<NewAlias extends string>(
    alias: NewAlias
  ): Table<TSchema, TableSource<TSource['name'], NewAlias>, DB>
}
```

**Key Behaviors:**

1. **Name Preserved**: The table's actual name stays the same
2. **Alias Changed**: Only the alias changes
3. **New Identity**: The result is a distinct table reference with new `TableSource` type
4. **Schema Shared**: Both references share the same schema
5. **Immutable**: Original table is unchanged

**Example:**

```typescript
const users = defineTable(db, "users", UserSchema)
// TableSource<"users", "users">

const managers = users.as("managers")
// TableSource<"users", "managers">

const employees = users.as("employees")
// TableSource<"users", "employees">

// All three reference the same table but have distinct identities
users._source.name      // "users"
users._source.alias     // "users"

managers._source.name   // "users"
managers._source.alias  // "managers"

employees._source.name  // "users"
employees._source.alias // "employees"
```

### 6.4 Self-Joins

Self-joins require aliasing to distinguish multiple references to the same table:

```typescript
const managers = users.as("managers")
const employees = users.as("employees")

const query = select({
  managerName: managers.name,
  managerEmail: managers.email,
  employeeName: employees.name,
  employeeEmail: employees.email
}).pipe(
  from(managers),
  innerJoin(employees, eq(employees.managerId, managers.id)),
  where((sources) =>
    and(
      isNotNull(sources.managers.email),
      gt(sources.employees.salary, 50000)
    )
  )
)

// Generated SQL (conceptual):
// SELECT
//   managers.name AS managerName,
//   managers.email AS managerEmail,
//   employees.name AS employeeName,
//   employees.email AS employeeEmail
// FROM users AS managers
// INNER JOIN users AS employees ON employees.manager_id = managers.id
// WHERE managers.email IS NOT NULL AND employees.salary > 50000
```

**Type Safety in Self-Joins:**

- `managers` and `employees` have different `TableSource` types
- Each is tracked independently in `TRequired` and `TAvailable`
- Cannot confuse `managers.id` with `employees.id` at type level
- Explicit source access in `where((sources) => ...)` provides clear scoping

### 6.5 Column Source Provenance

Columns carry their source identity:

```typescript
type Column<T, N, TSource extends TableSource<any, any>, DB> = {
  readonly _source: TSource
  // ...
}

// Example:
const users = defineTable(db, "users", UserSchema)
const col = users.name

col._source.name   // "users"
col._source.alias  // "users"

// After aliasing:
const managers = users.as("managers")
const managerName = managers.name

managerName._source.name   // "users"
managerName._source.alias  // "managers"
```

**Purpose:**

- Validate columns reference available sources in `where()`, `orderBy()`, etc.
- Generate correct SQL with proper table aliases
- Enable type-safe explicit source access: `sources.managers.name`

### 6.6 Source Tracking in Plans

Plans track sources in two ways:

```typescript
type Plan<
  TSelect,
  TRequired extends TableSource<any, any>,      // Union of unfulfilled
  TAvailable extends Record<string, TableSource<any, any>>,  // Record by alias
  TDialect,
  DB
>
```

#### TRequired (Union Type)

- **Type**: Union of `TableSource` types
- **Purpose**: Track which sources are referenced in `select()` but not yet added
- **Operations**: `from()` and joins use `Exclude<TRequired, TSource>` to remove sources

```typescript
// After select()
type Required = TableSource<"users", "users"> | TableSource<"posts", "posts">

// After from(users)
type Required = TableSource<"posts", "posts">  // users excluded

// After join(posts, ...)
type Required = never  // posts excluded, now empty
```

#### TAvailable (Record Type)

- **Type**: Record mapping alias → `TableSource`
- **Purpose**: Track which sources are available for use in operations
- **Key**: The table alias (for explicit source access)
- **Operations**: `from()` and joins add to this record

```typescript
// After select()
type Available = {}

// After from(users)
type Available = { users: TableSource<"users", "users"> }

// After join(posts, ...)
type Available = {
  users: TableSource<"users", "users">,
  posts: TableSource<"posts", "posts">
}

// With aliases:
const managers = users.as("managers")
const employees = users.as("employees")

// After from(managers), join(employees, ...)
type Available = {
  managers: TableSource<"users", "managers">,
  employees: TableSource<"users", "employees">
}
```

### 6.7 Alias Resolution

When using explicit source access in `where()`:

```typescript
type AvailableTables<
  TAvail extends Record<string, TableSource<any, any>>,
  DB
> = {
  [K in keyof TAvail]: Table<any, TAvail[K], DB>
}

function where<TSelect, TReq, TAvail, D, DB>(
  predicate: Expression<boolean, any, D, DB> 
    | ((sources: AvailableTables<TAvail, DB>) => Expression<boolean, any, D, DB>)
): (plan: Plan<TSelect, TReq, TAvail, D, DB>) => Plan<...>

// Usage:
where((sources) => {
  // sources is typed as:
  // {
  //   users: Table<UserSchema, TableSource<"users", "users">, DB>,
  //   posts: Table<PostSchema, TableSource<"posts", "posts">, DB>
  // }
  
  return and(
    isNotNull(sources.users.email),
    gt(sources.posts.views, 1000)
  )
})
```

**Key Behaviors:**

1. `sources` object keys match table aliases
2. Each value is a fully-typed `Table` with correct source identity
3. Accessing `sources.users.email` returns a `Column` with `TableSource<"users", "users">`
4. Type-safe: `sources.unknownTable` is a compile error

### 6.8 Aliasing Rules

**Rule 1: Aliases Must Be Unique in a Query**

While the type system doesn't automatically enforce this (you can theoretically create two different table references with the same alias), doing so would cause runtime SQL errors:

```typescript
const users1 = users.as("u")
const users2 = users.as("u")  // Same alias - problematic!

select({
  a: users1.name,
  b: users2.name
}).pipe(
  from(users1),
  join(users2, ...)
)
// Runtime error: Ambiguous alias "u"
```

**Recommendation**: Consider runtime validation or linter rules to catch this.

**Rule 2: Aliasing Is Immutable**

```typescript
const users = defineTable(db, "users", UserSchema)
const managers = users.as("managers")

// users is unchanged:
users._source.alias  // Still "users"

// managers is a new reference:
managers._source.alias  // "managers"
```

**Rule 3: Aliases Are Local to a Query**

Each query can use different aliases for the same table:

```typescript
// Query 1: "managers" and "employees"
const query1 = select({ ... }).pipe(
  from(users.as("managers")),
  join(users.as("employees"), ...)
)

// Query 2: "authors" and "editors"
const query2 = select({ ... }).pipe(
  from(users.as("authors")),
  join(users.as("editors"), ...)
)

// No conflict - aliases are scoped to their queries
```

---

## Query Requirements Tracking

This section specifies how the type system tracks unfulfilled table requirements and ensures all referenced tables are added before execution.

### 7.1 The Requirement Problem

When `select()` is called, it references columns from tables that haven't been added to the query yet:

```typescript
const query = select({ 
  id: users.id,        // References "users" table
  title: posts.title   // References "posts" table
})

// At this point:
// - No FROM clause
// - No tables added
// - Query is incomplete
```

**Goal**: Track at the type level which tables must still be added, and only allow execution when all requirements are fulfilled.

### 7.2 TRequired Type Parameter

The `Plan` type has a `TRequired` parameter that is a union of unfulfilled `TableSource` types:

```typescript
type Plan<
  TSelect,
  TRequired extends TableSource<any, any>,  // Union of unfulfilled sources
  TAvailable extends Record<string, TableSource<any, any>>,
  TDialect,
  DB
>
```

**Lifecycle:**

1. **`select()` populates `TRequired`**: Extracts all table sources referenced in the selection
2. **`from()` and joins remove from `TRequired`**: Each operation uses `Exclude<TRequired, TSource>`
3. **Execution requires `TRequired extends never`**: Can only execute when all requirements fulfilled

### 7.3 Extracting Requirements from select()

The `select()` function must infer which table sources are referenced:

```typescript
/**
 * Extract all TableSource types from a selection object
 */
type ExtractSources<TSelection> = 
  TSelection extends Column<any, any, infer TSource, any> ? TSource :
  TSelection extends Expression<any, any, any, any> ? never :
  TSelection extends Record<string, any> ? 
    ExtractSources<TSelection[keyof TSelection]> :
  never

/**
 * select() signature
 */
function select<TSelection extends SelectionShape, DB>(
  selection: TSelection
): Plan<
  TSelection,
  ExtractSources<TSelection>,  // TRequired: extracted sources
  {},  // TAvailable: empty initially
  never,  // TDialect: cross-compatible
  DB
>

// Example:
const query = select({
  userId: users.id,        // Column<..., TableSource<"users", "users">, ...>
  postTitle: posts.title,  // Column<..., TableSource<"posts", "posts">, ...>
  computed: literal(42)    // Expression, not a column - ignored
})

// Type:
// Plan<
//   { userId: Column<...>, postTitle: Column<...>, computed: Expression<...> },
//   TableSource<"users", "users"> | TableSource<"posts", "posts">,  // TRequired
//   {},  // TAvailable
//   never,
//   DB
// >
```

**Key Behaviors:**

- Only `Column` types contribute to requirements (they have `_source`)
- Plain `Expression` types don't (they're not tied to a table)
- Nested selection objects are recursively traversed
- Result is a union of all distinct `TableSource` types

### 7.4 Fulfilling Requirements with from()

The `from()` function removes its table source from `TRequired`:

```typescript
/**
 * from() signature - removes table from requirements
 */
function from<TSelect, TReq extends TableSource<any, any>, TAvail, D, DB, TSource extends TReq>(
  table: Table<any, TSource, DB>
): (plan: Plan<TSelect, TReq, TAvail, D, DB>) 
  => Plan<
    TSelect,
    Exclude<TReq, TSource>,  // Remove TSource from requirements
    TAvail & Record<TSource['alias'], TSource>,  // Add to available
    D,
    DB
  >

// Example:
const query = select({ 
  id: users.id, 
  title: posts.title 
}).pipe(
  from(users)
)

// Before from():
// TRequired = TableSource<"users", "users"> | TableSource<"posts", "posts">

// After from(users):
// TRequired = Exclude<
//   TableSource<"users", "users"> | TableSource<"posts", "posts">,
//   TableSource<"users", "users">
// >
// = TableSource<"posts", "posts">
```

**Type Constraint: `TSource extends TReq`**

This constraint ensures you can only pass a table that's actually required:

```typescript
const query = select({ id: users.id }).pipe(
  from(users),  // ✓ users is in TRequired
  from(posts)   // ❌ Type error: posts not in TRequired
)
```

**Error Message:**
```
Type error: Table 'posts' is not required by this query
Required tables: none (all requirements fulfilled)
Attempted to add: TableSource<"posts", "posts">

Tables must be referenced in select() before being added with from() or join().
```

### 7.5 Fulfilling Requirements with Joins

Join operations work the same way as `from()`:

```typescript
/**
 * innerJoin() signature
 */
function innerJoin<TSelect, TReq, TAvail, D, DB, TSource extends TReq>(
  table: Table<any, TSource, DB>,
  predicate: Expression<boolean, any, D, DB>
): (plan: Plan<TSelect, TReq, TAvail, D, DB>)
  => Plan<
    TSelect,
    Exclude<TReq, TSource>,  // Remove from requirements
    TAvail & Record<TSource['alias'], TSource>,  // Add to available
    D,
    DB
  >

// Example:
const query = select({
  userName: users.name,
  postTitle: posts.title
}).pipe(
  from(users),  // Removes TableSource<"users", "users"> from TRequired
  innerJoin(posts, eq(posts.userId, users.id))  // Removes TableSource<"posts", "posts">
)

// After both:
// TRequired = never (all requirements fulfilled)
```

**Note: Predicate Not Type-Checked Against TRequired**

The predicate can reference any available sources, not just the one being joined. This allows flexible join conditions.

### 7.6 Execution Constraint

Execution is only allowed when `TRequired extends never`:

```typescript
/**
 * execute() signature - requires all requirements fulfilled
 */
function execute<TSelect, TAvail, D, DB>(
  plan: Plan<
    TSelect,
    never,  // TRequired must be never!
    TAvail,
    D,
    DB
  >
): Effect<DecodeResult<TSelect>, SqlError, DatabaseConnection<DB>>

// Usage:
const incomplete = select({ id: users.id, title: posts.title }).pipe(
  from(users)
  // Missing join for posts
)

execute(incomplete)  
// ❌ Type error: TRequired = TableSource<"posts", "posts">, not never

const complete = select({ id: users.id, title: posts.title }).pipe(
  from(users),
  innerJoin(posts, eq(posts.userId, users.id))
)

execute(complete)  // ✓ Works: TRequired = never
```

**Error Message:**
```
Type error: Cannot execute incomplete query
Unfulfilled requirements: TableSource<"posts", "posts">

All tables referenced in select() must be added via from() or join() before execution.
Missing table: posts
```

### 7.7 Self-Join Requirements

Self-joins create multiple requirements for the same table:

```typescript
const managers = users.as("managers")
const employees = users.as("employees")

const query = select({
  managerName: managers.name,    // Requires TableSource<"users", "managers">
  employeeName: employees.name   // Requires TableSource<"users", "employees">
}).pipe(
  from(managers),    // Fulfills TableSource<"users", "managers">
  innerJoin(employees, eq(employees.managerId, managers.id))  // Fulfills TableSource<"users", "employees">
)

// TRequired starts as:
// TableSource<"users", "managers"> | TableSource<"users", "employees">

// After from(managers):
// TableSource<"users", "employees">

// After join(employees, ...):
// never ✓
```

**Key Point**: Each aliased table is tracked separately. `TableSource<"users", "managers">` and `TableSource<"users", "employees">` are distinct types.

### 7.8 Union Type Behavior

TypeScript unions have useful properties for requirement tracking:

```typescript
// Automatic deduplication:
type Req1 = TableSource<"users", "users"> | TableSource<"users", "users">
// Simplifies to: TableSource<"users", "users">

// Exclude removes matching members:
type Req2 = Exclude<
  TableSource<"users", "users"> | TableSource<"posts", "posts">,
  TableSource<"users", "users">
>
// Result: TableSource<"posts", "posts">

// Exclude with no match:
type Req3 = Exclude<TableSource<"users", "users">, TableSource<"posts", "posts">>
// Result: TableSource<"users", "users"> (no change)

// Exclude all:
type Req4 = Exclude<TableSource<"users", "users">, TableSource<"users", "users">>
// Result: never
```

These behaviors make requirement tracking natural and efficient.

### 7.9 Requirement Introspection

At runtime, plans can expose their requirements for diagnostics:

```typescript
interface Plan<TSelect, TRequired, TAvail, TDialect, DB> {
  /**
   * Get the unfulfilled requirements (runtime)
   */
  getUnfulfilledRequirements(): TableSource<any, any>[]
  
  /**
   * Check if the plan is ready to execute (runtime)
   */
  isComplete(): boolean
}

// Usage:
const plan = select({ id: users.id, title: posts.title }).pipe(
  from(users)
)

console.log(plan.getUnfulfilledRequirements())
// [{ name: "posts", alias: "posts" }]

console.log(plan.isComplete())  // false

const complete = plan.pipe(innerJoin(posts, eq(posts.userId, users.id)))

console.log(complete.getUnfulfilledRequirements())  // []
console.log(complete.isComplete())  // true
```

### 7.10 Edge Cases

#### Empty Selection

```typescript
const query = select({}).pipe(from(users))
// TRequired = never (nothing referenced)
// Can execute immediately
```

#### Non-Column Expressions Only

```typescript
const query = select({ 
  constant: literal(42),
  computed: add(literal(1), literal(2))
}).pipe(from(users))
// TRequired = never (no columns referenced)
// Can execute, though from(users) is redundant
```

#### Referencing Columns After from()

```typescript
const query = select({ id: users.id }).pipe(
  from(users),
  where(isNotNull(posts.title))  // ❌ posts not available!
)

// This is caught by TAvailable checking, not TRequired
// where() validates predicate columns are in TAvail
```

---

## API Design and Composability

This section specifies the complete query builder API, covering all major operations and their composition rules.

### 8.1 Core API Principles

1. **Functional Composition**: All operations are pure functions that take and return plans
2. **Effect Integration**: Plans implement `Pipeable` and work with `pipe()` operator
3. **Type-Driven**: Operations leverage the type system to enforce correctness
4. **Explicit Over Implicit**: No magic behavior; all operations are explicit

### 8.2 select() - Query Initialization

```typescript
/**
 * Initialize a query with a selection.
 * Extracts column sources and establishes requirements.
 */
function select<TSelection extends SelectionShape, DB>(
  selection: TSelection
): Plan<
  TSelection,
  ExtractSources<TSelection>,  // TRequired
  {},  // TAvailable (empty)
  never,  // TDialect (cross-compatible)
  InferDB<TSelection>  // DB from columns
>

type SelectionShape = 
  | Column<any, any, any, any>
  | Expression<any, any, any, any>
  | { [key: string]: SelectionShape }

// Examples:
select({ id: users.id })  // Simple column
select({ userId: users.id, postTitle: posts.title })  // Multiple tables
select({ user: { id: users.id, name: users.name } })  // Nested object
select({ constant: literal(42) })  // No table requirements
```

**Behaviors:**

- Recursively extracts `TableSource` from all `Column` types
- Builds `TRequired` as union of extracted sources
- Infers `DB` from columns (all must match)
- Returns incomplete plan (TRequired not fulfilled)

### 8.3 from() - Set Base Table

```typescript
/**
 * Set the base table for the query.
 * Can only be called once per query.
 * 
 * @constraint TSource must be in TRequired
 * @constraint Cannot call from() multiple times
 */
function from<TSelect, TReq extends TableSource<any, any>, TAvail, D, DB, TSource extends TReq>(
  table: Table<any, TSource, DB>
): (plan: Plan<TSelect, TReq, TAvail, D, DB>) 
  => Plan<
    TSelect,
    Exclude<TReq, TSource>,
    TAvail & Record<TSource['alias'], TSource> & { _hasFrom: true },
    D,
    DB
  >

// Usage:
select({ id: users.id }).pipe(
  from(users)  // ✓ Sets base table
)

select({ id: users.id }).pipe(
  from(users),
  from(posts)  // ❌ Type error: from() already called
)
```

**Constraint: One from() Per Query**

To enforce this, `TAvailable` includes a marker `_hasFrom: true` after first `from()`:

```typescript
type HasFrom<TAvail> = "_hasFrom" extends keyof TAvail ? true : false

function from<...>(
  table: Table<any, TSource, DB>
): (plan: Plan<TSelect, TReq, TAvail, D, DB>) 
  => HasFrom<TAvail> extends true 
    ? never  // Error: from() already called
    : Plan<...>  // Success
```

### 8.4 Join Operations

All join types follow the same signature pattern:

```typescript
/**
 * INNER JOIN
 */
function innerJoin<TSelect, TReq, TAvail, D, DB, TSource extends TReq>(
  table: Table<any, TSource, DB>,
  predicate: Expression<boolean, any, D, DB>
): (plan: Plan<TSelect, TReq, TAvail, D, DB>)
  => Plan<
    TSelect,
    Exclude<TReq, TSource>,
    TAvail & Record<TSource['alias'], TSource>,
    D,
    DB
  >

/**
 * LEFT JOIN
 * Nullability: All columns from right table become "maybe"
 */
function leftJoin<TSelect, TReq, TAvail, D, DB, TSource extends TReq>(
  table: Table<any, TSource, DB>,
  predicate: Expression<boolean, any, D, DB>
): (plan: Plan<TSelect, TReq, TAvail, D, DB>)
  => Plan<
    ApplyLeftJoinNullability<TSelect, TSource>,  // Transform nullability
    Exclude<TReq, TSource>,
    TAvail & Record<TSource['alias'], TSource>,
    D,
    DB
  >

/**
 * RIGHT JOIN
 * Nullability: All columns from left tables become "maybe"
 */
function rightJoin<TSelect, TReq, TAvail, D, DB, TSource extends TReq>(
  table: Table<any, TSource, DB>,
  predicate: Expression<boolean, any, D, DB>
): (plan: Plan<TSelect, TReq, TAvail, D, DB>)
  => Plan<
    ApplyRightJoinNullability<TSelect, TAvail>,  // Transform nullability
    Exclude<TReq, TSource>,
    TAvail & Record<TSource['alias'], TSource>,
    D,
    DB
  >

/**
 * FULL JOIN
 * Nullability: All columns from both sides become "maybe"
 */
function fullJoin<TSelect, TReq, TAvail, D, DB, TSource extends TReq>(
  table: Table<any, TSource, DB>,
  predicate: Expression<boolean, any, D, DB>
): (plan: Plan<TSelect, TReq, TAvail, D, DB>)
  => Plan<
    ApplyFullJoinNullability<TSelect>,  // Transform nullability
    Exclude<TReq, TSource>,
    TAvail & Record<TSource['alias'], TSource>,
    D,
    DB
  >
```

**Join Predicate Requirements:**

- Must return `Expression<boolean, ...>`
- Should reference columns from available sources
- Can use any comparison operators
- Always explicit (no FK inference in v1)

**Example:**

```typescript
select({ 
  userName: users.name,
  postTitle: posts.title 
}).pipe(
  from(users),
  innerJoin(posts, eq(posts.userId, users.id)),  // Explicit predicate
  leftJoin(comments, eq(comments.postId, posts.id))
)
```

### 8.5 where() - Filter Rows

```typescript
/**
 * Add a WHERE clause.
 * Supports both implicit column access and explicit source parameters.
 * 
 * Predicates can refine nullability (isNotNull, isNull, eq).
 */
function where<TSelect, TReq, TAvail, D, DB>(
  predicate: 
    | Expression<boolean, any, D, DB>
    | ((sources: AvailableTables<TAvail, DB>) => Expression<boolean, any, D, DB>)
): (plan: Plan<TSelect, TReq, TAvail, D, DB>) 
  => Plan<
    ApplyRefinements<TSelect, ExtractRefinements<typeof predicate>>,
    TReq,
    TAvail,
    D,
    DB
  >

// Usage - implicit:
where(gt(users.age, 18))

// Usage - explicit sources:
where((sources) =>
  and(
    isNotNull(sources.users.email),
    gt(sources.posts.views, 1000)
  )
)
```

**Nullability Refinement:**

Predicates with refinements (see §4.3) update the nullability of expressions in `TSelect`:

```typescript
select({ name: users.name }).pipe(  // name is "maybe"
  from(users),
  where(isNotNull(users.name))  // Refines name to "never"
)
// Result type: { name: string } (not string | null)
```

### 8.6 orderBy() - Sort Results

```typescript
/**
 * Order results by one or more expressions.
 */
function orderBy<TSelect, TReq, TAvail, D, DB>(
  ordering: OrderingTerm<D, DB> | readonly OrderingTerm<D, DB>[]
): (plan: Plan<TSelect, TReq, TAvail, D, DB>) 
  => Plan<TSelect, TReq, TAvail, D, DB>

type OrderingTerm<D, DB> = {
  expr: Expression<any, any, D, DB>
  direction?: "asc" | "desc"
  nulls?: "first" | "last"
}

// Usage:
orderBy({ expr: users.name, direction: "asc" })
orderBy([
  { expr: users.createdAt, direction: "desc" },
  { expr: users.name, direction: "asc" }
])

// Shorthand helpers:
asc(users.name)   // → { expr: users.name, direction: "asc" }
desc(users.name)  // → { expr: users.name, direction: "desc" }
```

### 8.7 limit() and offset() - Pagination

```typescript
/**
 * Limit number of results
 */
function limit<TSelect, TReq, TAvail, D, DB>(
  count: number
): (plan: Plan<TSelect, TReq, TAvail, D, DB>) 
  => Plan<TSelect, TReq, TAvail, D, DB>

/**
 * Skip rows
 */
function offset<TSelect, TReq, TAvail, D, DB>(
  count: number
): (plan: Plan<TSelect, TReq, TAvail, D, DB>) 
  => Plan<TSelect, TReq, TAvail, D, DB>

// Usage:
select({ id: users.id }).pipe(
  from(users),
  orderBy(desc(users.createdAt)),
  limit(10),
  offset(20)
)
```

### 8.8 groupBy() - Aggregation

```typescript
/**
 * Group results by expressions.
 * Changes projection rules: only group keys and aggregates allowed.
 */
function groupBy<TSelect, TReq, TAvail, D, DB>(
  keys: Expression<any, any, D, DB> | readonly Expression<any, any, D, DB>[]
): (plan: Plan<TSelect, TReq, TAvail, D, DB>)
  => Plan<
    ValidateGroupedProjection<TSelect, typeof keys>,  // Enforce projection rules
    TReq,
    TAvail,
    D,
    DB
  >

// Usage:
select({
  userId: users.id,
  postCount: count(posts.id)
}).pipe(
  from(users),
  innerJoin(posts, eq(posts.userId, users.id)),
  groupBy(users.id)  // userId is the group key
)

// Invalid grouping:
select({
  userId: users.id,
  userName: users.name,  // ❌ Not a group key, not an aggregate
  postCount: count(posts.id)
}).pipe(
  from(users),
  innerJoin(posts, eq(posts.userId, users.id)),
  groupBy(users.id)
)
// Type error: userName must be a group key or aggregate
```

**Projection Validation:**

```typescript
type ValidateGroupedProjection<TSelect, TGroupKeys> = 
  // For each field in TSelect:
  // - Must be in TGroupKeys, OR
  // - Must be an aggregate expression
  // Otherwise, type error
```

### 8.9 having() - Filter Groups

```typescript
/**
 * Filter groups (post-aggregation).
 * Can only be used after groupBy().
 */
function having<TSelect, TReq, TAvail, D, DB>(
  predicate: Expression<boolean, any, D, DB>
): (plan: Plan<TSelect, TReq, TAvail, D, DB>)
  => Plan<TSelect, TReq, TAvail, D, DB>

// Usage:
select({
  userId: users.id,
  postCount: count(posts.id)
}).pipe(
  from(users),
  innerJoin(posts, eq(posts.userId, users.id)),
  groupBy(users.id),
  having(gt(count(posts.id), 10))  // Only users with > 10 posts
)
```

### 8.10 execute() - Run Query

```typescript
/**
 * Execute the plan and return results.
 * 
 * @constraint TRequired must be never (all requirements fulfilled)
 * @constraint Plan's TDialect must be compatible with executor's dialect
 */
function execute<TSelect, TAvail, D extends Dialect, DB>(
  plan: Plan<TSelect, never, TAvail, D, DB>
): Effect<DecodeResult<TSelect>[], SqlError, DatabaseConnection<DB>>

// Executor compatibility check happens at runtime/type level:
const executor: Executor<"postgres", DB> = ...

executor.execute(plan)  // Plan's TDialect must be compatible with "postgres"
```

**Result Decoding:**

```typescript
type DecodeResult<TSelect> = {
  [K in keyof TSelect]: TSelect[K] extends Expression<infer T, infer N, any, any>
    ? DecodeNullability<T, N>
    : DecodeResult<TSelect[K]>  // Recursive for nested objects
}

type DecodeNullability<T, N extends Nullability> =
  N extends "never" ? T :
  N extends "always" ? null :
  T | null

// Example:
const plan = select({
  id: users.id,           // Expression<string, "never", ...>
  name: users.name,       // Expression<string, "maybe", ...>
  meta: {
    email: users.email    // Expression<string, "maybe", ...>
  }
}).pipe(...)

type Result = DecodeResult<typeof plan["_select"]>
// {
//   id: string,
//   name: string | null,
//   meta: {
//     email: string | null
//   }
// }
```

### 8.11 Composition Rules

**Rule 1: Only one from()**

```typescript
select(...).pipe(
  from(users),
  from(posts)  // ❌ Error
)
```

**Rule 2: Joins come after from()**

```typescript
select(...).pipe(
  innerJoin(posts, ...)  // ❌ Error: no from() yet
)
```

**Rule 3: groupBy() before having()**

```typescript
select(...).pipe(
  from(users),
  having(...)  // ❌ Error: no groupBy() yet
)
```

**Rule 4: All requirements must be fulfilled before execute()**

```typescript
select({ id: users.id, title: posts.title }).pipe(
  from(users)
  // Missing posts!
).pipe(execute)  // ❌ Type error: TRequired = TableSource<"posts", "posts">
```

**Rule 5: Cannot reference unavailable sources**

```typescript
select({ id: users.id }).pipe(
  from(users),
  where(eq(posts.title, "test"))  // ❌ Error: posts not in TAvailable
)
```

### 8.12 Pipeable Integration

All operations work with Effect's `pipe`:

```typescript
import { pipe } from "effect"

const query = pipe(
  select({ id: users.id }),
  from(users),
  where(gt(users.age, 18)),
  orderBy(asc(users.name)),
  limit(10)
)

// Plans also have .pipe() method for inline chaining:
const query2 = select({ id: users.id }).pipe(
  from(users),
  where(gt(users.age, 18))
)
```

---

## Schema Definition

This section specifies how schemas are defined using Effect Schema integration.

### 9.1 Effect Schema Integration

Schemas are defined using `@effect/schema`, providing runtime validation and type inference:

```typescript
import { Schema } from "@effect/schema"

/**
 * Define a schema for a database table using Effect Schema
 */
const UserSchema = Schema.Struct({
  id: Schema.UUID,
  name: Schema.String,
  email: Schema.String.pipe(Schema.email),
  age: Schema.Number.pipe(Schema.int, Schema.greaterThan(0)),
  createdAt: Schema.Date,
  updatedAt: Schema.Date.pipe(Schema.optional)
})

type User = Schema.Schema.Type<typeof UserSchema>
// {
//   id: string
//   name: string
//   email: string
//   age: number
//   createdAt: Date
//   updatedAt?: Date
// }
```

### 9.2 Table Definition with Metadata

Tables are defined by combining Effect Schema with database metadata:

```typescript
/**
 * Define a table with schema and metadata
 */
function defineTable<
  Name extends string,
  TSchema extends Schema.Schema<any>,
  DB
>(
  db: DatabaseConnection<DB>,
  name: Name,
  schema: TSchema,
  metadata?: TableMetadata
): Table<Schema.Schema.Type<TSchema>, TableSource<Name, Name>, DB>

type TableMetadata = {
  primaryKey?: string | readonly string[]
  indexes?: readonly IndexDefinition[]
  foreignKeys?: readonly ForeignKeyDefinition[]
  constraints?: readonly ConstraintDefinition[]
}

type IndexDefinition = {
  columns: readonly string[]
  unique?: boolean
  name?: string
}

type ForeignKeyDefinition = {
  columns: readonly string[]
  references: {
    table: string
    columns: readonly string[]
  }
  onDelete?: "cascade" | "restrict" | "set null" | "no action"
  onUpdate?: "cascade" | "restrict" | "set null" | "no action"
}

type ConstraintDefinition = {
  type: "check" | "unique" | "not null"
  expr?: string  // For check constraints
  columns?: readonly string[]  // For unique constraints
}
```

**Example:**

```typescript
const users = defineTable(db, "users", UserSchema, {
  primaryKey: "id",
  indexes: [
    { columns: ["email"], unique: true },
    { columns: ["createdAt"] }
  ],
  foreignKeys: []
})

const posts = defineTable(db, "posts", PostSchema, {
  primaryKey: "id",
  indexes: [
    { columns: ["userId"] },
    { columns: ["createdAt"] }
  ],
  foreignKeys: [
    {
      columns: ["userId"],
      references: { table: "users", columns: ["id"] },
      onDelete: "cascade"
    }
  ]
})
```

### 9.3 Column Nullability Inference

Nullability is inferred from Effect Schema:

```typescript
/**
 * Infer nullability from Effect Schema
 */
type InferNullability<S extends Schema.Schema<any>> =
  Schema.Schema.Encoded<S> extends null | undefined ? "maybe" :
  S extends Schema.optional<any> ? "maybe" :
  "never"

// Examples:
Schema.String                          // → "never" (required, non-null)
Schema.String.pipe(Schema.optional)    // → "maybe" (optional)
Schema.Union(Schema.String, Schema.Null)  // → "maybe" (nullable)
```

### 9.4 Database Type Mapping

Effect Schema types map to database types:

```typescript
/**
 * Map Effect Schema to database column types
 */
type SchemaToDatabaseType<S extends Schema.Schema<any>> =
  S extends typeof Schema.UUID ? { type: "uuid" } :
  S extends typeof Schema.String ? { type: "text" } :
  S extends typeof Schema.Number ? { type: "numeric" } :
  S extends typeof Schema.Int ? { type: "integer" } :
  S extends typeof Schema.Boolean ? { type: "boolean" } :
  S extends typeof Schema.Date ? { type: "timestamp" } :
  // ... more mappings
  { type: "unknown" }

// Example:
const schema = Schema.Struct({
  id: Schema.UUID,        // → { type: "uuid" }
  age: Schema.Int,        // → { type: "integer" }
  name: Schema.String,    // → { type: "text" }
  score: Schema.Number    // → { type: "numeric" }
})
```

### 9.5 Schema Validation

Effect Schema provides runtime validation:

```typescript
/**
 * Validate query results against schema
 */
function executeWithValidation<TSelect, TAvail, D, DB, TSchema extends Schema.Schema<any>>(
  plan: Plan<TSelect, never, TAvail, D, DB>,
  schema: TSchema
): Effect<
  Schema.Schema.Type<TSchema>[],
  SqlError | Schema.ParseError,
  DatabaseConnection<DB>
>

// Usage:
const query = select({ 
  id: users.id, 
  name: users.name 
}).pipe(
  from(users)
)

const results = executeWithValidation(query, UserSchema)
// Results are validated against UserSchema at runtime
// ParseError if database returns invalid data
```

### 9.6 Complete Table Definition Example

```typescript
import { Schema } from "@effect/schema"

// Define schemas
const UserSchema = Schema.Struct({
  id: Schema.UUID,
  name: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(255)),
  email: Schema.String.pipe(Schema.email),
  age: Schema.Number.pipe(Schema.int, Schema.between(0, 150)),
  role: Schema.Literal("admin", "user", "guest"),
  createdAt: Schema.Date,
  updatedAt: Schema.Date.pipe(Schema.optional),
  deletedAt: Schema.Union(Schema.Date, Schema.Null).pipe(Schema.optional)
})

const PostSchema = Schema.Struct({
  id: Schema.UUID,
  userId: Schema.UUID,
  title: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(500)),
  content: Schema.String,
  published: Schema.Boolean,
  views: Schema.Number.pipe(Schema.int, Schema.greaterThanOrEqualTo(0)),
  createdAt: Schema.Date,
  updatedAt: Schema.Date
})

// Create database connection
const db = createDatabaseConnection("postgres://...")

// Define tables
const users = defineTable(db, "users", UserSchema, {
  primaryKey: "id",
  indexes: [
    { columns: ["email"], unique: true },
    { columns: ["role"] },
    { columns: ["createdAt"] }
  ]
})

const posts = defineTable(db, "posts", PostSchema, {
  primaryKey: "id",
  indexes: [
    { columns: ["userId"] },
    { columns: ["published", "createdAt"] }
  ],
  foreignKeys: [
    {
      columns: ["userId"],
      references: { table: "users", columns: ["id"] },
      onDelete: "cascade"
    }
  ]
})

// Tables are now ready to use in queries
const query = select({
  userName: users.name,
  postTitle: posts.title
}).pipe(
  from(users),
  innerJoin(posts, eq(posts.userId, users.id))
)
```

### 9.7 Schema Evolution

While the library doesn't handle migrations directly, schemas can be versioned:

```typescript
// Version 1
const UserSchemaV1 = Schema.Struct({
  id: Schema.UUID,
  name: Schema.String
})

// Version 2 - add email
const UserSchemaV2 = Schema.Struct({
  ...UserSchemaV1.fields,
  email: Schema.String.pipe(Schema.optional)  // Optional for backward compatibility
})

// Use appropriate version
const users = defineTable(db, "users", UserSchemaV2, { ... })
```

---

## Complete Usage Examples

This section provides comprehensive examples demonstrating all major features.

### 10.1 Simple Select

```typescript
// Select all columns from a table
const allUsers = select({
  id: users.id,
  name: users.name,
  email: users.email
}).pipe(
  from(users)
)

// Execute
const results = await execute(allUsers)
// Type: Array<{ id: string, name: string | null, email: string | null }>
```

### 10.2 Filtered Query with Nullability Refinement

```typescript
const activeUsers = select({
  id: users.id,
  name: users.name,
  email: users.email
}).pipe(
  from(users),
  where(
    and(
      isNotNull(users.email),  // Refines email to "never"
      eq(users.role, "active")
    )
  )
)

const results = await execute(activeUsers)
// Type: Array<{ id: string, name: string | null, email: string }>
// Note: email is string, not string | null
```

### 10.3 Join with Explicit Sources

```typescript
const userPosts = select({
  userName: users.name,
  userEmail: users.email,
  postTitle: posts.title,
  postViews: posts.views
}).pipe(
  from(users),
  innerJoin(posts, eq(posts.userId, users.id)),
  where((sources) =>
    and(
      isNotNull(sources.users.email),
      gt(sources.posts.views, 100)
    )
  ),
  orderBy([
    desc(posts.views),
    asc(users.name)
  ])
)

const results = await execute(userPosts)
```

### 10.4 Self-Join

```typescript
const managers = users.as("managers")
const employees = users.as("employees")

const managementHierarchy = select({
  managerName: managers.name,
  managerEmail: managers.email,
  employeeName: employees.name,
  employeeEmail: employees.email
}).pipe(
  from(managers),
  innerJoin(employees, eq(employees.managerId, managers.id)),
  where((sources) =>
    and(
      eq(sources.managers.role, "manager"),
      eq(sources.employees.role, "employee")
    )
  )
)

const results = await execute(managementHierarchy)
```

### 10.5 Aggregation with Grouping

```typescript
const userPostStats = select({
  userId: users.id,
  userName: users.name,
  postCount: count(posts.id),
  totalViews: sum(posts.views),
  avgViews: avg(posts.views)
}).pipe(
  from(users),
  leftJoin(posts, eq(posts.userId, users.id)),
  groupBy([users.id, users.name]),
  having(gt(count(posts.id), 5)),
  orderBy(desc(count(posts.id)))
)

const results = await execute(userPostStats)
// Type: Array<{
//   userId: string,
//   userName: string | null,
//   postCount: number,
//   totalViews: number | null,
//   avgViews: number | null
// }>
```

### 10.6 Complex Multi-Table Query

```typescript
const complexQuery = select({
  user: {
    id: users.id,
    name: users.name,
    email: users.email
  },
  post: {
    id: posts.id,
    title: posts.title,
    views: posts.views
  },
  commentCount: count(comments.id)
}).pipe(
  from(users),
  innerJoin(posts, eq(posts.userId, users.id)),
  leftJoin(comments, eq(comments.postId, posts.id)),
  where((sources) =>
    and(
      isNotNull(sources.users.email),
      eq(sources.posts.published, true),
      gt(sources.posts.views, 1000)
    )
  ),
  groupBy([
    users.id,
    users.name,
    users.email,
    posts.id,
    posts.title,
    posts.views
  ]),
  orderBy([
    desc(posts.views),
    asc(users.name)
  ]),
  limit(20),
  offset(0)
)

const results = await execute(complexQuery)
```

### 10.7 Dialect-Specific Features

```typescript
// PostgreSQL-specific: ILIKE
const pgQuery = select({ name: users.name }).pipe(
  from(users),
  where(ilike(users.name, "%john%"))  // Case-insensitive search
)
// Query dialect: "postgres"

const pgExecutor: Executor<"postgres", DB> = createExecutor(db, "postgres")
await pgExecutor.execute(pgQuery)  // ✓ Works

const mysqlExecutor: Executor<"mysql", DB> = createExecutor(db, "mysql")
await mysqlExecutor.execute(pgQuery)  // ❌ Type error: dialect mismatch
```

### 10.8 Cross-Compatible Query

```typescript
// Works on all dialects
const crossCompatQuery = select({
  id: users.id,
  name: users.name
}).pipe(
  from(users),
  where(
    and(
      like(users.name, "%test%"),  // Standard LIKE
      gt(users.age, 18)
    )
  ),
  orderBy(asc(users.name))
)
// Query dialect: never (cross-compatible)

// Can execute on any dialect
await pgExecutor.execute(crossCompatQuery)     // ✓
await mysqlExecutor.execute(crossCompatQuery)  // ✓
await sqliteExecutor.execute(crossCompatQuery) // ✓
```

### 10.9 Transaction Example

```typescript
import { Effect } from "effect"

const transferOperation = Effect.gen(function* (_) {
  // Both queries share the transaction's DB identity
  const deduct = update(accounts)
    .set({ balance: sub(accounts.balance, 100) })
    .where(eq(accounts.id, fromAccountId))
  
  const add = update(accounts)
    .set({ balance: add(accounts.balance, 100) })
    .where(eq(accounts.id, toAccountId))
  
  yield* _(execute(deduct))
  yield* _(execute(add))
})

const result = await transaction(db, transferOperation)
```

### 10.10 Introspection Example

```typescript
const query = select({
  id: users.id,
  title: posts.title
}).pipe(
  from(users),
  innerJoin(posts, eq(posts.userId, users.id))
)

// Runtime introspection
console.log(query.getUnfulfilledRequirements())  // []
console.log(query.isComplete())  // true
console.log(query.getSupportedDialects())  // ["postgres", "mysql", "sqlite"]
console.log(query.getDatabaseId())  // "primary"

// Type-level introspection
type RequiredSources = typeof query["_required"]  // never
type AvailableSources = typeof query["_available"]  
// { users: TableSource<"users", "users">, posts: TableSource<"posts", "posts"> }
type Dialect = typeof query["_dialect"]  // never (cross-compatible)
```

---

## Open Questions and Next Steps

### 11.1 Resolved Design Questions

#### 11.1.1 Window Functions ✓ RESOLVED

**Decision:** Window functions are tracked as expressions with a distinct aggregation kind, validated at multiple levels.

**Design:**

```typescript
/**
 * Aggregation kinds including window functions
 */
type AggregationKind = "scalar" | "aggregate" | "window"

/**
 * Expression now tracks aggregation kind
 */
type Expression<
  T,
  N extends Nullability = "maybe",
  D extends Dialect = never,
  DB = any,
  AggKind extends AggregationKind = "scalar"
> = {
  readonly _tag: "Expression"
  readonly _type: T
  readonly _nullability: N
  readonly _dialect: D
  readonly _db: DB
  readonly _aggKind: AggKind
}

/**
 * Window expressions carry window specification
 */
type WindowExpression<T, N, D, DB, TAvail> = 
  Expression<T, N, D, DB, "window"> & {
    readonly _windowSpec: WindowSpec<D, DB, TAvail>
  }

/**
 * Window specification with type-safe partition/order clauses
 */
type WindowSpec<D, DB, TAvail> = {
  readonly partitionBy?: readonly Expression<any, any, D, DB, "scalar">[]
  readonly orderBy?: readonly OrderingTerm<D, DB>[]
  readonly frame?: WindowFrame
}

type WindowFrame = {
  readonly mode: "range" | "rows" | "groups"
  readonly start: FrameBound
  readonly end?: FrameBound
}

type FrameBound =
  | { type: "unbounded_preceding" }
  | { type: "preceding", offset: number }
  | { type: "current_row" }
  | { type: "following", offset: number }
  | { type: "unbounded_following" }

/**
 * Window function builders that validate against available sources
 */
interface WindowBuilder<T, N, D, DB, TAvail> {
  over(spec: WindowSpec<D, DB, TAvail>): WindowExpression<T, N, D, DB, TAvail>
}

// Window function constructors
function rowNumber<D, DB, TAvail>(): WindowBuilder<number, "never", D, DB, TAvail>
function rank<D, DB, TAvail>(): WindowBuilder<number, "never", D, DB, TAvail>
function denseRank<D, DB, TAvail>(): WindowBuilder<number, "never", D, DB, TAvail>
function lag<T, N, D, DB, TAvail>(
  expr: Expression<T, N, D, DB, "scalar">,
  offset?: number,
  default?: T
): WindowBuilder<T, "maybe", D, DB, TAvail>
function lead<T, N, D, DB, TAvail>(
  expr: Expression<T, N, D, DB, "scalar">,
  offset?: number,
  default?: T
): WindowBuilder<T, "maybe", D, DB, TAvail>
```

**Validation Rules:**

1. **Where Clause Restriction**: Window functions cannot appear in WHERE clauses
   ```typescript
   function where<TSelect, TReq, TAvail, D, DB>(
     predicate: Expression<boolean, any, D, DB, Exclude<AggregationKind, "window">>
     // ❌ Window expressions rejected at type level
   ): (plan: Plan<...>) => Plan<...>
   ```

2. **Partition/Order Validation**: PARTITION BY and ORDER BY must reference available sources
   ```typescript
   // WindowSpec references TAvail, ensuring columns are in scope
   type WindowSpec<D, DB, TAvail>
   
   // At usage time:
   select({
     name: users.name,
     rowNum: rowNumber<never, DB, { users: TableSource<"users", "users"> }>()
       .over({ partitionBy: [users.department] })  // ✓ users is available
   })
   ```

3. **Mixing Rules**: Windows and aggregates can coexist but follow projection rules
   ```typescript
   // Valid: window with aggregate, grouped by key
   select({
     dept: users.department,
     avgSalary: avg(users.salary),  // aggregate
     rowNum: rowNumber().over({ partitionBy: [users.department] })  // window
   }).pipe(
     from(users),
     groupBy(users.department)
   )
   
   // Invalid: window without proper grouping context
   select({
     name: users.name,  // ❌ Not grouped, not aggregate, not window
     rowNum: rowNumber().over({ partitionBy: [users.department] })
   })
   ```

**Implementation Note:** The `TAvail` parameter in window functions is inferred from the query context, likely passed implicitly by `select()` or other query builders.

**Example Usage:**

```typescript
// Simple window function
const rankedUsers = select({
  name: users.name,
  salary: users.salary,
  rank: rank().over({
    orderBy: [desc(users.salary)]
  })
}).pipe(from(users))

// Partitioned window
const deptRanks = select({
  name: users.name,
  department: users.department,
  salary: users.salary,
  deptRank: rank().over({
    partitionBy: [users.department],
    orderBy: [desc(users.salary)]
  })
}).pipe(from(users))

// Multiple tables with window
const query = select({
  userName: users.name,
  postTitle: posts.title,
  postRank: rowNumber().over({
    partitionBy: [posts.userId],
    orderBy: [desc(posts.createdAt)]
  })
}).pipe(
  from(users),
  innerJoin(posts, eq(posts.userId, users.id))
)
```

---

#### 11.1.2 Subqueries ✓ RESOLVED

**Decision:** Table and Plan are unified. Since `Table` IS a `Plan`, subqueries work automatically with no special handling needed.

**Design Insight:**

The unification of Table and Plan (see §3.3-3.4) means subqueries "just work":

```typescript
// A table is a plan
const users: Table<...> = defineTable(...)  // Returns a Plan

// A subquery is also a plan
const adults = select({ id: users.id, name: users.name }).pipe(
  from(users),
  where(gt(users.age, 18))
)  // Returns a Plan

// Both can be used identically
select({ id: users.id }).pipe(from(users))
select({ id: adults.id }).pipe(from(adults.as("adults")))
```

**No Special Types Needed:**

- `from()` already accepts any `Plan` where `TRequired extends never`
- Column access (`plan.columnName`) works for all completed plans
- `.as(alias)` works for all completed plans
- Nullability flows through naturally

**Nullability Preservation:**

Nullability refinements in subqueries are preserved:

```typescript
const subquery = select({
  id: users.id,           // Expression<string, "never", ...>
  name: users.name        // Expression<string, "maybe", ...>
}).pipe(
  from(users),
  where(isNotNull(users.name))  // Refines name to "never"
)

// When used in outer query:
const aliased = subquery.as("sub")
aliased.name  // Column<string, "never", ...> - refinement preserved!
```

**Example Usage:**

```typescript
// Simple subquery
const adults = select({ id: users.id, name: users.name }).pipe(
  from(users),
  where(gt(users.age, 18))
)

const query = select({ id: adults.id, name: adults.name }).pipe(
  from(adults.as("adults"))
)

// Aggregated subquery in join
const postCounts = select({
  userId: posts.userId,
  count: count(posts.id)
}).pipe(
  from(posts),
  where(eq(posts.published, true)),
  groupBy(posts.userId)
)

const usersWithCounts = select({
  userName: users.name,
  postCount: postCounts.count
}).pipe(
  from(users),
  innerJoin(postCounts.as("counts"), eq(postCounts.userId, users.id))
)

// Deeply nested
const l1 = select({ id: users.id }).pipe(from(users), where(gt(users.age, 18)))
const l2 = select({ id: l1.id }).pipe(from(l1.as("l1")), limit(100))
const l3 = select({ id: l2.id }).pipe(from(l2.as("l2")), offset(10))
```

**Correlated Subqueries:**

Correlated subqueries (scalar subqueries that reference outer query) are **deferred to Phase 2**. They require:
- Special `scalar()` or `exists()` operators
- Outer query context passing
- More complex type checking

```typescript
// FUTURE - Phase 2
const query = select({
  name: users.name,
  postCount: scalar(  // Special operator
    select({ count: count(posts.id) }).pipe(
      from(posts),
      correlate((outer) => where(eq(posts.userId, outer.users.id)))
    )
  )
}).pipe(from(users))
```

**Validation:**

1. ✅ **Completeness**: Plan must have `TRequired extends never` to use in `from()`/joins
2. ✅ **Dialect compatibility**: Subquery dialect must be compatible with outer query (automatic via type system)
3. ✅ **Database identity**: Subquery must share `DB` with outer query (automatic via type system)
4. ✅ **Aliasing**: `.as(alias)` creates proper `TableSource` for tracking

---

#### 11.1.3 Mutations as Plans ✓ RESOLVED

**Decision:** INSERT/UPDATE/DELETE are Plans. With RETURNING, they return rows; without RETURNING, they return an empty result or row count.

**Design Insight:**

Mutations are not a separate type - they're just Plans that have side effects:

```typescript
/**
 * INSERT returns a Plan
 */
function insert<TSchema, TSource, DB>(
  table: Table<TSchema, TSource, DB>
): InsertBuilder<TSchema, DB>

interface InsertBuilder<TSchema, DB> {
  values(rows: Partial<TSchema> | readonly Partial<TSchema>[]): InsertPlan<{}, DB>
  
  // With RETURNING, becomes a queryable Plan
  returning<TSelect>(
    selection: TSelect
  ): Plan<TSelect, never, {}, never, DB>
}

type InsertPlan<TSelect, DB> = Plan<
  TSelect,  // Empty {} without RETURNING, or selected columns with RETURNING
  never,
  {},
  never,
  DB
> & {
  readonly _mutation: "insert"
}

/**
 * UPDATE returns a Plan
 */
function update<TSchema, TSource, DB>(
  table: Table<TSchema, TSource, DB>
): UpdateBuilder<TSchema, TSource, DB>

interface UpdateBuilder<TSchema, TSource, DB> {
  set(values: Partial<TSchema>): UpdatePlan<{}, TSource, DB>
  
  // With RETURNING
  returning<TSelect>(
    selection: TSelect
  ): Plan<TSelect, never, Record<TSource['alias'], TSource>, never, DB>
}

/**
 * DELETE returns a Plan
 */
function deleteFrom<TSchema, TSource, DB>(
  table: Table<TSchema, TSource, DB>
): DeleteBuilder<TSchema, TSource, DB>

interface DeleteBuilder<TSchema, TSource, DB> {
  where(predicate: Expression<boolean, any, never, DB>): DeletePlan<{}, TSource, DB>
  
  // With RETURNING
  returning<TSelect>(
    selection: TSelect
  ): Plan<TSelect, never, Record<TSource['alias'], TSource>, never, DB>
}
```

**Key Properties:**

1. **Mutations ARE Plans**: Same type, same composition
2. **RETURNING enables querying**: Can use in FROM, CTEs, subqueries
3. **Empty TSelect**: Without RETURNING, `TSelect = {}` or `{ count: Expression<number, "never"> }`
4. **Side effects**: Plans with `_mutation` marker have side effects when executed

**Example Usage:**

```typescript
// Insert without RETURNING
const insertPlan = insert(users).values({ name: "John", email: "john@example.com" })
await execute(insertPlan)  // Returns { count: 1 } or similar

// Insert with RETURNING
const insertedUser = insert(users)
  .values({ name: "John", email: "john@example.com" })
  .returning({ id: users.id, name: users.name })

await execute(insertedUser)  
// Returns Array<{ id: string, name: string }>

// Use mutation in CTE
const inserted = insert(users)
  .values({ name: "John" })
  .returning({ id: users.id, name: users.name })
  .as("inserted")

const query = select({
  newUserId: inserted.id,
  newUserName: inserted.name
}).pipe(
  from(inserted)
)

// Update with RETURNING
const updated = update(users)
  .set({ name: "Jane" })
  .where(eq(users.id, someId))
  .returning({ id: users.id, name: users.name })

// Delete with RETURNING  
const deleted = deleteFrom(users)
  .where(eq(users.status, "inactive"))
  .returning({ id: users.id })

// Complex mutation with join in CTE
const newPosts = insert(posts)
  .values({ title: "New Post", userId: someUserId })
  .returning({ id: posts.id, title: posts.title })
  .as("new_posts")

const result = select({
  userName: users.name,
  postTitle: newPosts.title
}).pipe(
  from(users),
  innerJoin(newPosts, eq(newPosts.userId, users.id))
)
```

**Dialect Support:**

RETURNING is dialect-specific:
- PostgreSQL: Full support
- SQLite: Supported (since 3.35.0)
- MySQL: No support (before 8.0.21) / Limited support

```typescript
// RETURNING narrows dialect
const plan = insert(users)
  .values({ name: "John" })
  .returning({ id: users.id })

// plan has TDialect = "postgres" | "sqlite"
```

---

#### 11.1.4 CTEs (Common Table Expressions) ✓ RESOLVED

**Decision:** CTEs are implicit. Use `.as()` to name plans, and the SQL generator optimizes to CTEs when beneficial (e.g., when a plan is referenced multiple times).

**Design Philosophy:**

Since Plans are unified, CTEs are just named plans. No special syntax needed:

```typescript
// Create named plans
const adults = select({ id: users.id, name: users.name }).pipe(
  from(users),
  where(gt(users.age, 18))
).as("adults")

const activePosts = select({ id: posts.id, title: posts.title }).pipe(
  from(posts),
  where(eq(posts.published, true))
).as("active_posts")

// Use them like tables
const query = select({
  adultName: adults.name,
  postTitle: activePosts.title
}).pipe(
  from(adults),
  innerJoin(activePosts, eq(activePosts.userId, adults.id))
)
```

**SQL Generation Strategy:**

The SQL generator decides whether to use CTEs based on:

1. **Multiple references**: If a named plan is used multiple times in the same query tree, generate a CTE
2. **Complexity heuristics**: Very complex subqueries might benefit from CTEs for readability
3. **Explicit marking** (future): Allow `.asCTE()` to force CTE generation

```typescript
// Example: Multiple references → automatic CTE
const expensiveSubquery = select({ id: users.id, total: sum(orders.amount) }).pipe(
  from(users),
  innerJoin(orders, eq(orders.userId, users.id)),
  groupBy(users.id)
).as("user_totals")

const query = select({
  avgTotal: avg(expensiveSubquery.total),
  maxTotal: max(expensiveSubquery.total),
  count: count(expensiveSubquery.id)
}).pipe(
  from(expensiveSubquery)
)

// Generated SQL uses CTE:
// WITH user_totals AS (
//   SELECT users.id, SUM(orders.amount) as total
//   FROM users
//   JOIN orders ON orders.user_id = users.id
//   GROUP BY users.id
// )
// SELECT AVG(user_totals.total), MAX(user_totals.total), COUNT(user_totals.id)
// FROM user_totals
```

**Recursive CTEs (Future):**

Recursive CTEs can be supported with explicit marking:

```typescript
// FUTURE - Phase 2
const orgHierarchy = recursiveCTE("org_hierarchy", {
  // Base case
  base: select({ id: employees.id, managerId: employees.managerId, level: literal(1) }).pipe(
    from(employees),
    where(isNull(employees.managerId))
  ),
  
  // Recursive case
  recursive: (self) => select({
    id: employees.id,
    managerId: employees.managerId,
    level: add(self.level, 1)
  }).pipe(
    from(employees),
    innerJoin(self, eq(employees.managerId, self.id))
  )
})

const query = select({ id: orgHierarchy.id, level: orgHierarchy.level }).pipe(
  from(orgHierarchy)
)
```

**Benefits of Implicit Approach:**

1. ✅ **Simplicity**: No special CTE syntax to learn
2. ✅ **Optimization**: SQL generator can make smart decisions
3. ✅ **Composability**: Named plans compose like any other plan
4. ✅ **Type safety**: Same type checking for CTEs and subqueries
5. ✅ **Flexibility**: Can force CTE generation later if needed

**Type Representation:**

CTEs don't need special types - they're just aliased Plans:

```typescript
const cte = select({ id: users.id }).pipe(from(users)).as("my_cte")
// Type: Plan<{ id: Expression<...> }, never, {...}, never, DB>

// No difference from regular aliased plan
```

---

#### 11.1.5 Union/Intersect/Except ✓ RESOLVED

**Decision:** Set operations combine plans and return new plans. TSelect shapes must match structurally, and nullability is unified (conservative).

**Design:**

```typescript
/**
 * UNION - combines results, removes duplicates
 */
function union<TSelect, TAvail1, TAvail2, D1, D2, DB>(
  left: Plan<TSelect, never, TAvail1, D1, DB>,
  right: Plan<TSelect, never, TAvail2, D2, DB>
): Plan<
  UnifyNullability<TSelect>,
  never,
  {},  // TAvailable is empty (not accessible in set operations)
  IntersectDialect<D1, D2>,
  DB
>

/**
 * UNION ALL - combines results, keeps duplicates
 */
function unionAll<TSelect, TAvail1, TAvail2, D1, D2, DB>(
  left: Plan<TSelect, never, TAvail1, D1, DB>,
  right: Plan<TSelect, never, TAvail2, D2, DB>
): Plan<UnifyNullability<TSelect>, never, {}, IntersectDialect<D1, D2>, DB>

/**
 * INTERSECT - returns rows present in both
 */
function intersect<TSelect, TAvail1, TAvail2, D1, D2, DB>(
  left: Plan<TSelect, never, TAvail1, D1, DB>,
  right: Plan<TSelect, never, TAvail2, D2, DB>
): Plan<UnifyNullability<TSelect>, never, {}, IntersectDialect<D1, D2>, DB>

/**
 * EXCEPT/MINUS - returns rows in left but not in right
 */
function except<TSelect, TAvail1, TAvail2, D1, D2, DB>(
  left: Plan<TSelect, never, TAvail1, D1, DB>,
  right: Plan<TSelect, never, TAvail2, D2, DB>
): Plan<UnifyNullability<TSelect>, never, {}, IntersectDialect<D1, D2>, DB>
```

**Nullability Unification:**

When combining plans, nullability becomes conservative (if either side is nullable, result is nullable):

```typescript
/**
 * Unify nullability across set operations
 * If any expression is nullable, result is nullable
 */
type UnifyNullability<TSelect> = {
  [K in keyof TSelect]: TSelect[K] extends Expression<infer T, infer N, infer D, infer DB>
    ? Expression<T, UnifyNull<N>, D, DB>
    : TSelect[K]
}

type UnifyNull<N extends Nullability> =
  N extends "never" ? "maybe" :  // Be conservative
  N extends "maybe" ? "maybe" :
  "maybe"  // "always" also becomes "maybe" in unions

// More precise version for multiple plans:
type UnifyNullabilityMulti<N1 extends Nullability, N2 extends Nullability> =
  N1 extends "never" 
    ? N2 extends "never" ? "never" : "maybe"
    : "maybe"
```

**Type Shape Matching:**

Plans must have structurally compatible TSelect:

```typescript
const plan1 = select({ id: users.id, name: users.name }).pipe(from(users))
// TSelect: { id: Expression<string, "never">, name: Expression<string, "maybe"> }

const plan2 = select({ id: admins.id, name: admins.name }).pipe(from(admins))
// TSelect: { id: Expression<string, "never">, name: Expression<string, "never"> }

const combined = union(plan1, plan2)
// TSelect: { id: Expression<string, "maybe">, name: Expression<string, "maybe"> }

// Type error examples:
const plan3 = select({ id: users.id, email: users.email }).pipe(from(users))
union(plan1, plan3)  // ❌ Type error: keys don't match (name vs email)

const plan4 = select({ id: users.name, name: users.id }).pipe(from(users))
union(plan1, plan4)  // ❌ Type error: types don't match (string vs string, but semantically wrong)
```

**Example Usage:**

```typescript
// Simple union
const activeUsers = select({ id: users.id, name: users.name }).pipe(
  from(users),
  where(eq(users.status, "active"))
)

const adminUsers = select({ id: admins.id, name: admins.name }).pipe(
  from(admins)
)

const allUsers = union(activeUsers, adminUsers)

// Chain multiple unions
const plan1 = select({ id: users.id }).pipe(from(users))
const plan2 = select({ id: admins.id }).pipe(from(admins))
const plan3 = select({ id: guests.id }).pipe(from(guests))

const combined = union(union(plan1, plan2), plan3)

// Use union result as subquery
const uniqueIds = union(
  select({ id: users.id }).pipe(from(users)),
  select({ id: admins.id }).pipe(from(admins))
).as("unique_ids")

const query = select({ id: uniqueIds.id }).pipe(
  from(uniqueIds),
  orderBy(asc(uniqueIds.id))
)

// Union with complex queries
const userPosts = select({
  authorId: users.id,
  authorName: users.name,
  contentTitle: posts.title,
  contentType: literal("post")
}).pipe(
  from(users),
  innerJoin(posts, eq(posts.userId, users.id))
)

const userComments = select({
  authorId: users.id,
  authorName: users.name,
  contentTitle: comments.text,
  contentType: literal("comment")
}).pipe(
  from(users),
  innerJoin(comments, eq(comments.userId, users.id))
)

const allContent = unionAll(userPosts, userComments)
```

**Ordering and Limiting:**

Set operations can be followed by ordering and limiting:

```typescript
const combined = union(plan1, plan2)

const ordered = combined.pipe(
  orderBy(asc(combined.name)),
  limit(10)
)

// Or using the result as a subquery:
const limited = union(plan1, plan2).as("combined")

const query = select({ id: limited.id, name: limited.name }).pipe(
  from(limited),
  orderBy(desc(limited.id))
)
```

**Dialect Compatibility:**

Set operations work on all dialects, but nullability handling may vary. The type system ensures compatibility:

```typescript
const pgPlan = select({ name: users.name }).pipe(
  from(users),
  where(ilike(users.name, "%test%"))  // Postgres-specific
)
// TDialect: "postgres"

const crossPlan = select({ name: admins.name }).pipe(from(admins))
// TDialect: never (cross-compatible)

const combined = union(pgPlan, crossPlan)
// TDialect: IntersectDialect<"postgres", never> = "postgres"
// Result can only run on Postgres
```

---

#### 11.1.6 Dynamic Queries ✓ RESOLVED

**Decision:** Dynamic queries are supported through conditional composition. Operations like `where()`, `orderBy()`, etc. can be applied conditionally, and the type system tracks the result.

**Design Philosophy:**

Since all operations are pure functions, dynamic queries are just conditional function application:

```typescript
// Build query conditionally
let query = select({ id: users.id, name: users.name }).pipe(from(users))

// Conditionally add WHERE clause
if (filterByAge) {
  query = query.pipe(where(gt(users.age, 18)))
}

// Conditionally add ORDER BY
if (sortByName) {
  query = query.pipe(orderBy(asc(users.name)))
}

// Conditionally add LIMIT
if (limit) {
  query = query.pipe(limit(limit))
}
```

**Type-Safe Optional Filters:**

Use Effect's Option or conditionals:

```typescript
import { Option } from "effect"

function buildUserQuery(
  minAge?: number,
  search?: string,
  limit?: number
) {
  let query = select({ id: users.id, name: users.name }).pipe(from(users))
  
  // Optional WHERE conditions
  if (minAge !== undefined) {
    query = query.pipe(where(gt(users.age, minAge)))
  }
  
  if (search !== undefined) {
    query = query.pipe(where(like(users.name, `%${search}%`)))
  }
  
  // Optional LIMIT
  if (limit !== undefined) {
    query = query.pipe(limit(limit))
  }
  
  return query
}

// Or using Option
function buildQueryWithOption(
  minAge: Option.Option<number>,
  search: Option.Option<string>
) {
  return pipe(
    select({ id: users.id, name: users.name }),
    from(users),
    // Apply filter if Some
    Option.match(minAge, {
      onNone: () => identity,
      onSome: (age) => where(gt(users.age, age))
    }),
    Option.match(search, {
      onNone: () => identity,
      onSome: (term) => where(like(users.name, `%${term}%`))
    })
  )
}
```

**Helper for Conditional Application:**

```typescript
/**
 * Apply operation conditionally
 */
function when<T>(
  condition: boolean,
  fn: (value: T) => T
): (value: T) => T {
  return condition ? fn : identity
}

// Usage:
const query = select({ id: users.id, name: users.name }).pipe(
  from(users),
  when(!!minAge, where(gt(users.age, minAge!))),
  when(!!search, where(like(users.name, `%${search}%`))),
  when(!!sortByName, orderBy(asc(users.name))),
  when(!!limit, limit(limit!))
)
```

**Dynamic Joins:**

```typescript
function buildQueryWithOptionalJoin(includePosts: boolean) {
  let query = select({
    userId: users.id,
    userName: users.name,
    ...(includePosts ? { postTitle: posts.title } : {})
  }).pipe(from(users))
  
  if (includePosts) {
    query = query.pipe(
      innerJoin(posts, eq(posts.userId, users.id))
    )
  }
  
  return query
}

// Note: TSelect type changes based on includePosts!
// Return type is a union of possible shapes
```

**Type-Safe Filter Builder:**

```typescript
type FilterCondition<TSchema, DB> = {
  field: keyof TSchema
  operator: "eq" | "gt" | "lt" | "like"
  value: any
}

function applyFilters<TSchema, TSource, DB>(
  table: Table<TSchema, TSource, DB>,
  filters: FilterCondition<TSchema, DB>[]
) {
  let conditions: Expression<boolean, any, never, DB>[] = []
  
  for (const filter of filters) {
    const column = table[filter.field]
    
    switch (filter.operator) {
      case "eq":
        conditions.push(eq(column, filter.value))
        break
      case "gt":
        conditions.push(gt(column, filter.value))
        break
      case "lt":
        conditions.push(lt(column, filter.value))
        break
      case "like":
        conditions.push(like(column, filter.value))
        break
    }
  }
  
  return and(...conditions)
}

// Usage:
const filters: FilterCondition<UserSchema, DB>[] = [
  { field: "age", operator: "gt", value: 18 },
  { field: "name", operator: "like", value: "%john%" }
]

const query = select({ id: users.id }).pipe(
  from(users),
  where(applyFilters(users, filters))
)
```

**Dynamic Column Selection:**

```typescript
function selectDynamicColumns<K extends keyof UserSchema>(
  columns: K[]
): Plan<...> {
  const selection = columns.reduce((acc, col) => ({
    ...acc,
    [col]: users[col]
  }), {})
  
  return select(selection).pipe(from(users))
}

// Usage:
const query = selectDynamicColumns(["id", "name", "email"])
// Type: Plan<{ id: Column<...>, name: Column<...>, email: Column<...> }, ...>
```

**Pagination Builder:**

```typescript
type PaginationOptions = {
  page?: number
  pageSize?: number
  orderBy?: "id" | "name" | "createdAt"
  orderDir?: "asc" | "desc"
}

function paginatedUsers(options: PaginationOptions) {
  const { page = 1, pageSize = 10, orderBy = "id", orderDir = "asc" } = options
  
  let query = select({
    id: users.id,
    name: users.name,
    createdAt: users.createdAt
  }).pipe(from(users))
  
  // Dynamic ordering
  const orderColumn = users[orderBy]
  query = query.pipe(
    orderBy(orderDir === "asc" ? asc(orderColumn) : desc(orderColumn))
  )
  
  // Pagination
  query = query.pipe(
    limit(pageSize),
    offset((page - 1) * pageSize)
  )
  
  return query
}
```

**Challenges and Limitations:**

1. **Union Types**: Conditionally adding joins creates union return types
2. **Type Narrowing**: TypeScript may struggle with complex conditional types
3. **Widening**: Dynamic selection may widen types to more general forms

**Best Practice:** For highly dynamic queries, consider:
- Building from small, composable pieces
- Using helper functions to encapsulate dynamic logic
- Accepting some type widening for runtime flexibility
- Type assertions when you know more than TypeScript does

---

#### 11.1.7 Batch Operations ✓ RESOLVED

**Decision:** Batch operations are supported through array inputs to INSERT and specialized batch helpers.

**Design:**

```typescript
/**
 * Batch INSERT - insert multiple rows
 */
insert(users).values([
  { name: "John", email: "john@example.com" },
  { name: "Jane", email: "jane@example.com" },
  { name: "Bob", email: "bob@example.com" }
])

// With RETURNING
insert(users)
  .values(arrayOfUsers)
  .returning({ id: users.id, name: users.name })
// Returns Plan<{ id: Expression<...>, name: Expression<...> }, never, {}, never, DB>
// When executed, returns Array<{ id: string, name: string }>

/**
 * Batch UPDATE - use WHERE with IN clause
 */
update(users)
  .set({ status: "active" })
  .where(inArray(users.id, [id1, id2, id3]))

/**
 * Batch DELETE
 */
deleteFrom(users)
  .where(inArray(users.id, idsToDelete))
  .returning({ id: users.id })
```

**Type Safety:**

```typescript
// Type-checked values
const validInsert = insert(users).values([
  { name: "John", email: "john@example.com" }  // ✓ Valid
])

const invalidInsert = insert(users).values([
  { name: "John" }  // ❌ Missing required field: email
])

// Inferred types
type InsertShape = Partial<UserSchema> | readonly Partial<UserSchema>[]
```

---

#### 11.1.8 JSON Operations ✓ RESOLVED

**Decision:** JSON operations are dialect-specific expressions. Full JSON path type safety is deferred to Phase 2.

**Phase 1 Design (Basic):**

```typescript
/**
 * JSON field access (dialect-specific)
 */
function jsonExtract<T, N, D, DB>(
  expr: Expression<JsonValue, N, D, DB>,
  path: string
): Expression<T | null, "maybe", Extract<D, "postgres" | "mysql" | "sqlite">, DB>

// PostgreSQL: -> and ->>
function jsonField<T, N, DB>(
  expr: Expression<JsonValue, N, never, DB>,
  field: string
): Expression<T | null, "maybe", "postgres", DB>

// Usage:
select({
  userId: users.id,
  settingValue: jsonExtract(users.settings, "$.theme")
}).pipe(from(users))

// PostgreSQL-specific
select({
  userId: users.id,
  theme: jsonField(users.metadata, "theme")
}).pipe(from(users))
```

**Phase 2 (Future - Type-Safe JSON Paths):**

```typescript
// FUTURE: Type-safe JSON schema
const UserSettingsSchema = Schema.Struct({
  theme: Schema.String,
  notifications: Schema.Struct({
    email: Schema.Boolean,
    push: Schema.Boolean
  })
})

// Define column with JSON schema
const users = defineTable(db, "users", {
  id: Schema.UUID,
  settings: Schema.json(UserSettingsSchema)  // Typed JSON column
})

// Type-safe access
select({
  theme: users.settings.theme,  // Type: Expression<string, "maybe">
  emailNotif: users.settings.notifications.email  // Type: Expression<boolean, "maybe">
}).pipe(from(users))
```

---

### 11.2 Summary of Resolved Questions

All major design questions have been resolved:

1. ✅ **Window Functions**: Tracked as expression with `AggKind = "window"`, validated at type level
2. ✅ **Subqueries**: Table/Plan unification makes subqueries automatic
3. ✅ **Mutations**: INSERT/UPDATE/DELETE are Plans with optional RETURNING
4. ✅ **CTEs**: Implicit via `.as()`, SQL generator optimizes
5. ✅ **Set Operations**: Union/intersect/except return unified Plans
6. ✅ **Dynamic Queries**: Conditional composition with pure functions
7. ✅ **Batch Operations**: Array inputs to INSERT, IN clauses for UPDATE/DELETE
8. ✅ **JSON Operations**: Basic support in Phase 1, deep path safety in Phase 2

### 11.3 Phase 2 Features (Deferred)

These features are intentionally deferred to Phase 2:

1. **Correlated Subqueries**: Scalar subqueries that reference outer query
   - Requires context passing mechanism
   - Special `correlate()` or `scalar()` operators

2. **Recursive CTEs**: WITH RECURSIVE support
   - Special `recursiveCTE()` builder
   - Base case + recursive case definition

3. **Type-Safe JSON Paths**: Deep JSON schema integration
   - Schema-aware JSON column access
   - Compile-time path validation

4. **Advanced Window Features**: 
   - Window frame exclusion clauses
   - Complex frame specifications

5. **Optimizer Hints**: Dialect-specific query hints
   - Index hints
   - Join method hints

6. **Materialized CTEs**: Explicit materialization control
   - PostgreSQL MATERIALIZED keyword
   - Performance optimization

### 11.4 Implementation Priorities
   - Should they be treated as inline tables with their own `Plan` type?
   - How does nullability flow through subqueries?

3. **CTEs (Common Table Expressions)**: 
   - How to represent WITH clauses?
   - Should CTEs be tracked in `TAvailable`?

4. **Union/Intersect/Except**: 
   - How to type set operations?
   - Should they require matching `TSelect` shapes?
   - How does nullability work across set operations?

5. **Insert/Update/Delete**:
   - Should mutations use the same `Plan` type?
   - How to handle RETURNING clauses?
   - Different type parameters needed?

6. **Dynamic Queries**:
   - How to support runtime-constructed queries while maintaining type safety?
   - Optional WHERE clauses, optional ORDER BY, etc.

7. **Batch Operations**:
   - Batch inserts with type safety?
   - Bulk updates?

8. **JSON Operations**:
   - Deep JSON path type safety?
   - JSON schema validation?

### 11.2 Implementation Priorities

**Phase 1: Core Foundation (MVP)**
1. Core types:
   - `Expression<T, N, D, DB, AggKind>`
   - `Column` (extends Expression with source tracking)
   - `Plan<TSelect, TRequired, TAvailable, TDialect, DB>` (unified Table/Plan)
   - `TableSource<Name, Alias>`

2. Basic query building:
   - `select()` - with requirement extraction
   - `from()` - accepts any completed Plan
   - `where()` - implicit column access only
   - Basic joins: `innerJoin()`, `leftJoin()`
   
3. Schema definition:
   - `defineTable()` with Effect Schema integration
   - Column type/nullability inference
   - Basic metadata (primary keys, indexes)

4. Execution:
   - `execute()` - with requirement checking (TRequired extends never)
   - Basic result decoding with nullability
   - Single-dialect executor

5. Core operators:
   - Comparison: `eq`, `gt`, `lt`, `gte`, `lte`, `ne`
   - Logical: `and`, `or`, `not`
   - Basic arithmetic: `add`, `sub`, `mul`, `div`
   - String: `like`, `concat`
   - Null checks: `isNull`, `isNotNull`

**Phase 2: Refinements & Safety**
1. Nullability refinements:
   - Track refinements from `isNotNull`, `isNull`, `eq`
   - Apply refinements to TSelect
   - Join nullability transformations

2. Advanced query features:
   - Explicit source access: `where((sources) => ...)`
   - Self-joins with `.as()` aliasing
   - `orderBy()`, `limit()`, `offset()`
   - Set operations: `union()`, `unionAll()`, `intersect()`, `except()`

3. Aggregation & grouping:
   - `groupBy()`, `having()`
   - Aggregate functions: `count`, `sum`, `avg`, `min`, `max`
   - Projection validation (grouped context)

4. Mutations:
   - `insert().values()` with array support
   - `update().set().where()`
   - `deleteFrom().where()`
   - `returning()` clause

**Phase 3: Advanced Features**
1. Window functions:
   - `rowNumber()`, `rank()`, `denseRank()`
   - `lag()`, `lead()`, `firstValue()`, `lastValue()`
   - PARTITION BY and ORDER BY validation
   - WHERE clause exclusion (type-level)

2. Dialect-specific operations:
   - PostgreSQL: `ilike`, JSONB operators (`@>`, `?`, etc.)
   - MySQL: `regexpLike`, JSON functions
   - SQLite: Basic JSON support
   - Dialect narrowing via type system

3. Multi-dialect support:
   - Cross-compatible query detection
   - Dialect compatibility checking
   - Error messages for dialect conflicts

4. Subqueries & CTEs:
   - Subqueries work automatically (Plan unification)
   - CTE optimization (detect multiple references)
   - Alias tracking and validation

**Phase 4: Polish & Optimization**
1. Error messages:
   - Actionable compile-time errors
   - Clear dialect conflict messages
   - Helpful requirement tracking errors

2. Performance:
   - Optimize type checking performance
   - Efficient SQL generation
   - Result decoder optimization

3. Developer Experience:
   - Type inference improvements
   - Helper utilities for common patterns
   - Documentation and examples

4. Testing:
   - Type-level tests with `tsd`
   - Integration tests per dialect
   - Nullability refinement tests
   - Requirement tracking tests

**Phase 5: Advanced (Future)**
1. Correlated subqueries
2. Recursive CTEs
3. Type-safe JSON paths
4. Query optimization hints
5. Materialized views
6. Advanced window features

---

## 12. Key Architectural Insights

This section summarizes the major insights discovered during the design process that fundamentally shaped the architecture.

### 12.1 Table IS Plan - The Unifying Insight

**Discovery:** A database table is conceptually equivalent to `select(*).pipe(from(table))` - it's just a completed Plan.

**Impact:**
- Eliminated the need for separate Table and Plan types
- Subqueries work automatically with no special handling
- CTEs become trivial (just named plans)
- Mutations with RETURNING are just Plans
- Massive simplification of the type system

**Before:**
```typescript
type Table<...> = { ... }  // Separate type
type Plan<...> = { ... }   // Different type
type SubqueryTable<...> = { ... }  // Yet another type
```

**After:**
```typescript
type Plan<...> = { ... }  // Universal type
type Table<...> = Plan<TSchema, never, ..., never, DB>  // Just an alias
// Subqueries are Plans
// CTEs are named Plans
// Mutations with RETURNING are Plans
```

### 12.2 Only Two Core Types

**Expression** and **Plan** are sufficient for the entire query DSL:

- **Expression**: Scalar values, computations, aggregates, windows
- **Plan**: Everything queryable - tables, queries, subqueries, CTEs, mutations

This minimalism leads to:
- Fewer concepts to learn
- Better composability
- Easier implementation
- Natural type inference

### 12.3 Requirements as Phantom Union Type

**Decision:** Track unfulfilled table requirements as a union of `TableSource` types in `TRequired`.

**Why it works:**
- TypeScript's `Exclude<Union, Type>` is built-in and efficient
- `never` type naturally represents "all requirements fulfilled"
- Union automatically deduplicates
- No complex recursive types needed

**Elegance:**
```typescript
// Starts as union of all referenced tables
TRequired = TableSource<"users"> | TableSource<"posts">

// Each from/join removes one
Exclude<TRequired, TableSource<"users">>  // = TableSource<"posts">
Exclude<TableSource<"posts">, TableSource<"posts">>  // = never

// Execute only when never
execute<TSelect, TAvail, D, DB>(
  plan: Plan<TSelect, never, TAvail, D, DB>
)
```

### 12.4 Nullability as Lattice

**Three-state system** (`"never" | "maybe" | "always"`) provides:
- Precision for type-level refinements
- Clear semantics for join transformations
- Support for always-null predicates (IS NULL)

**Key insight:** Nullability flows through operations predictably:
- Joins transform according to their semantics
- Predicates refine for the rest of the plan
- Aggregates define their own nullability
- Binary ops propagate conservatively

### 12.5 Dialect as Never = Universal

**Decision:** Default dialect is `never` (not a specific dialect) to represent "works on all dialects".

**Brilliance:**
- `never` is the identity for intersection: `IntersectDialect<never, D> = D`
- Dialect-specific ops narrow from `never` to specific dialects
- Natural type algebra with `Extract<D1, D2>`

**Example:**
```typescript
// Cross-compatible query
const q1: Plan<..., ..., ..., never, DB>  // Works everywhere

// Use Postgres-specific op
const q2 = q1.pipe(where(ilike(...)))
// Type: Plan<..., ..., ..., "postgres", DB>  // Now Postgres-only

// Composition narrows
IntersectDialect<never, "postgres"> = "postgres"  ✓
IntersectDialect<"postgres", "mysql"> = never     ✗ Error!
```

### 12.6 Mutations as Plans with Side Effects

**Insight:** INSERT/UPDATE/DELETE with RETURNING are just queries that happen to have side effects.

**Benefits:**
- No separate mutation type needed
- Can use mutations in CTEs
- Can use mutations as subqueries
- RETURNING makes them queryable
- Without RETURNING, just empty `TSelect`

### 12.7 Implicit CTEs via Optimizer

**Decision:** Don't require special CTE syntax - just use `.as()` and let SQL generator optimize.

**Why:**
- Simpler API (no new concepts)
- Compiler can make smart decisions (reuse detection)
- Same type for CTEs and subqueries
- Progressive enhancement (can add explicit CTE marker later)

### 12.8 Aggregation Kind as Fifth Type Parameter

**Decision:** Add `AggKind` to `Expression<T, N, D, DB, AggKind>` to track scalar/aggregate/window distinction.

**Enables:**
- Type-level enforcement of window functions in WHERE (rejected)
- Grouped projection validation
- Clear semantics for mixing aggregates and scalars

### 12.9 Effect Integration Throughout

**Principles:**
- All Plans are `Pipeable` (work with `pipe()`)
- Execution returns `Effect<Result, SqlError, DB>`
- Transactions use `Effect.gen` naturally
- Errors are first-class

**Result:** Natural integration with Effect ecosystem, no impedance mismatch.

### 12.10 Progressive Type Safety

**Philosophy:** Maximize type safety without sacrificing composability.

**Balance:**
- ✅ Enforce at type level: DB identity, dialect compatibility, requirement tracking
- ✅ Validate at type level: Nullability, aggregation kinds, source availability
- ⚠️ Runtime validation: Complex dynamic queries, deep JSON paths
- 📝 Documentation: Help users understand constraints

**Outcome:** 95% of errors caught at compile time, clear error messages for the rest.

---

## 13. Design Patterns and Idioms

### 13.1 The Select-From-Pipe Pattern

Standard query construction:
```typescript
select({ /* columns */ }).pipe(
  from(table),
  where(condition),
  orderBy(ordering)
)
```

### 13.2 The As-Pattern for Reuse

Name plans for reuse:
```typescript
const subquery = select({ ... }).pipe(...).as("alias")
const query = select({ ... }).pipe(from(subquery))
```

### 13.3 The Sources-Pattern for Clarity

Explicit source access in complex queries:
```typescript
where((sources) =>
  and(
    eq(sources.users.status, "active"),
    gt(sources.posts.views, 100)
  )
)
```

### 13.4 The When-Pattern for Dynamic Queries

Conditional composition:
```typescript
query.pipe(
  when(condition, operation),
  when(otherCondition, otherOperation)
)
```

### 13.5 The Builder-Pattern for Mutations

Fluent mutation construction:
```typescript
insert(table)
  .values({ ... })
  .returning({ ... })
```

---

## 14. Conclusion

This design represents a carefully considered approach to building a type-safe SQL query builder for TypeScript and Effect. The key architectural insights—particularly the unification of Table and Plan—lead to a remarkably simple and composable system.

**Core Principles Achieved:**
- ✅ Maximum type safety at compile time
- ✅ Minimal core concepts (Expression + Plan)
- ✅ Natural composition via pure functions
- ✅ Effect ecosystem integration
- ✅ Multi-dialect support with safety
- ✅ Predictable nullability tracking
- ✅ Clear error messages

**Ready for Implementation:**
The design is complete and detailed enough to begin implementation. All major architectural decisions have been made, open questions resolved, and implementation phases defined.

**Next Steps:**
1. Set up project structure
2. Implement Phase 1 (Core Foundation)
3. Write comprehensive tests
4. Iterate based on real-world usage

---

**End of Design Specification**

This document represents the complete, finalized design for Effect-SQL as of 2025-11-13. All design questions have been resolved collaboratively through systematic exploration of options and their tradeoffs.
2. Transaction support
3. Schema validation integration
4. Introspection API

**Phase 5: Polish**
1. Error messages
2. Documentation
3. Examples
4. Tests

### 11.3 Testing Strategy

1. **Type-level tests**: Use `tsd` or similar to test type inference
2. **Unit tests**: Test individual operations
3. **Integration tests**: Test complete queries against real databases
4. **Dialect tests**: Test cross-dialect compatibility
5. **Error tests**: Ensure proper error messages

### 11.4 Documentation Needs

1. API reference (generated from types)
2. Getting started guide
3. Recipe book (common patterns)
4. Migration guide (from other query builders)
5. Performance guide
6. Troubleshooting guide

### 11.5 Potential Optimizations

1. **Type performance**: Large unions in `TRequired` might slow TypeScript
   - Consider alternatives if performance becomes an issue
   
2. **SQL generation**: Optimize generated SQL
   - Query planning
   - Index hints
   
3. **Result decoding**: Optimize decoder performance
   - Batch decoding
   - Streaming results

### 11.6 Future Considerations

1. **Schema migrations**: Tooling for schema evolution
2. **Query optimization hints**: Allow users to guide SQL generation
3. **Monitoring/observability**: Query performance tracking
4. **Database-specific features**: Leverage unique dialect capabilities
5. **Code generation**: Generate TypeScript types from existing databases

---

## Appendix: Design Rationale

### Why Three-State Nullability?

The three-state system (`"never" | "maybe" | "always"`) provides:
- **Precision**: Distinguish non-null from possibly-null from always-null
- **Refinement**: Track how predicates affect nullability
- **Spec compliance**: Direct mapping to SPEC.md requirements

### Why Phantom Type Parameters?

Using phantom types for `DB` and `TDialect`:
- **Zero runtime cost**: No runtime checks needed
- **Compile-time safety**: Errors caught during development
- **Type narrowing**: Natural TypeScript type algebra

### Why Union for TRequired?

Union types for `TRequired`:
- **Simple type algebra**: `Exclude` is built-in and efficient
- **Automatic deduplication**: TypeScript handles duplicates
- **Clear semantics**: `never` means "all requirements fulfilled"

### Why Record for TAvailable?

Record type for `TAvailable`:
- **Named access**: `sources.users` is intuitive
- **Type safety**: Keys match aliases exactly
- **Extensible**: Easy to add sources with `&`

---

**End of Design Specification**

This document represents the complete type system design for Effect-SQL as of 2025-11-11. All major design decisions have been documented, rationalized, and specified in detail for implementation.

