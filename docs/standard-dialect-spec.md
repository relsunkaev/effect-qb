# Standard Dialect Specification

## Goal

The standard dialect is the portable authoring layer for `effect-qb`.

Users should be able to define tables, columns, scalar expressions, and query
plans with `effect-qb/standard` when they intend that SQL to run on the built-in
engines. A standard plan is not a fourth database backend. It is a typed promise
that the plan uses only portable SQL concepts, while each concrete renderer or
executor still emits the SQL shape required by its engine.

The end state is:

- `effect-qb/standard` is the default namespace for database-agnostic query code.
- Standard-only plans can be rendered or executed by Postgres, MySQL, and SQLite
  entrypoints.
- Standard plans that use one concrete-dialect expression narrow to that
  concrete dialect.
- Standard plans that mix incompatible concrete dialects fail at type level.
- Runtime renderer checks remain as the boundary guard for `any`, deserialized
  plans, or other untyped usage.

## Public API

The public entrypoint is:

```ts
import { Column, Function, Query, Renderer, Table } from "effect-qb"
```

It exposes:

- `Table` for portable table definitions.
- `Column` for portable column definitions.
- `Datatypes` for portable DB type witnesses and coercion families.
- `Query` for portable query, mutation, transaction, and DDL builders.
- `Function` for portable scalar, aggregate, string, temporal, and window
  functions.
- `Renderer` for reference standard-SQL rendering.
- Shared row, scalar, and executor contracts needed by portable code.

Concrete namespaces keep their current role:

```ts
import * as Pg from "effect-qb/postgres"
import * as My from "effect-qb/mysql"
import * as Sq from "effect-qb/sqlite"
```

Each concrete renderer and executor must accept standard-compatible plans.

## Dialect Model

Every scalar expression, source, and query plan carries a dialect tag.

The dialect lattice is:

| Combination | Result |
| --- | --- |
| `standard` + `standard` | `standard` |
| `standard` + concrete | concrete |
| same concrete + same concrete | concrete |
| different concretes | `DialectConflictError` |

Examples:

```ts
const users = Table.make("users", {
  id: Column.uuid().pipe(Column.primaryKey),
  email: Column.text()
})

const portable = Query.select({
  id: users.id,
  email: Function.lower(users.email)
}).pipe(
  Query.from(users)
)

Pg.Renderer.make().render(portable)
My.Renderer.make().render(portable)
Sq.Renderer.make().render(portable)
```

A concrete expression narrows the whole plan:

```ts
const postgresOnly = portable.pipe(
  Query.orderBy(Pg.Query.literal(1))
)

Pg.Renderer.make().render(postgresOnly)
// My.Renderer.make().render(postgresOnly) must fail at type level.
```

Mixing different concrete dialects is invalid:

```ts
const conflict = portable.pipe(
  Query.orderBy(Pg.Query.literal(1)),
  Query.where(My.Query.literal(true))
)

// Any concrete renderer should reject this at type level.
```

The type system is the primary enforcement mechanism. Runtime checks exist only
as defense at public render and execute boundaries.

## Standard Tables And Columns

`Table.make` defines tables whose columns carry the `standard` dialect tag.

Standard columns should expose only portable options. If an option has no shared
meaning across the built-in engines, it must not be available in `Column`.
Engine-specific column behavior belongs in the concrete namespace.

Required portable column coverage:

- identifiers and primary keys
- nullable and non-null columns
- defaults and generated values where representable
- unique constraints with portable options only
- references
- driver value mappings
- schema derivation

Required portable datatype families:

- text
- integer
- numeric
- real
- boolean
- date
- time
- datetime/timestamp
- json
- blob
- null

The runtime schema associated with a standard column should match the normalized
runtime value users get back from executors. For example, decimal-like values
should stay decimal strings when that is the established runtime contract.

## Standard Query Surface

Anything exported from `Query` that keeps the `standard` dialect tag must be
safe to render for every built-in concrete engine, or it must fail clearly before
users can execute incorrect SQL.

Required standard query coverage:

- literals and column references
- aliases and projection metadata
- predicates and boolean composition
- joins and table references
- CTEs
- subqueries, derived tables, and lateral sources where supported
- grouping, having, ordering, limit, and offset
- set operators when row shapes are compatible
- inserts, updates, deletes, and returning semantics where the target engine can
  represent them
- transactions and savepoints
- DDL for portable table and index definitions

If a SQL construct is not meaningfully portable, use one of these designs:

- Keep it out of `effect-qb/standard`.
- Expose a standard helper that narrows to a concrete dialect.
- Expose the helper only in concrete namespaces.
- Throw a renderer error for untyped or impossible runtime use, with type tests
  proving normal typed usage cannot reach the path.

Do not silently render a different semantic operation just to preserve
portability.

## Function Surface

`Function` should include common scalar and aggregate operations whose
meaning can be preserved across engines.

Required standard function coverage:

- string operations such as `lower`, `upper`, and `concat`
- aggregate operations such as `count`, `min`, and `max`
- null handling such as `coalesce`
- conditional expressions
- temporal helpers whose runtime type is stable
- window helpers where supported consistently

Concrete renderers may spell the same standard function differently. For
example, concatenation may render as `||` or `concat(...)` depending on the
engine.

## Rendering Contract

Rendering is dialect-owned.

The shared renderer layer should ask the selected `SqlDialect` how to render the
query AST and scalar expressions. It should not switch on dialect names in a
central dispatcher.

Each built-in dialect must define:

- dialect name
- identifier quoting
- literal and parameter rendering
- table reference rendering
- concatenation rendering
- query AST rendering
- scalar expression rendering

`Renderer` is a reference renderer for portable SQL. It should use standard
identifier quoting and `?` bind placeholders. It is useful for inspection,
generic drivers, and tests, but concrete engines should normally use their own
renderer or executor.

Concrete renderers must:

- accept `standard` plans
- accept plans narrowed to their own dialect
- reject plans narrowed to another dialect
- reject dialect-conflict plans
- preserve projection metadata
- preserve runtime value mappings
- validate outstanding sources before rendering
- render bind parameters in engine-specific format

Runtime compatibility checks must remain in the public renderer/executor
boundary. They are not a replacement for type tests.

## Executor Contract

Concrete executors should accept standard-compatible plans using the same
compatibility rule as concrete renderers.

Executor behavior must preserve:

- decoded row schemas
- projection aliases
- driver value mappings
- normalized runtime values
- typed error surfaces

There is no separate standard executor unless a generic driver abstraction is
added. Standard plans execute through a concrete engine.

## Extensibility

Adding a new dialect should require implementing a dialect object and renderer
surface, not editing a central render switch.

A new concrete dialect is complete when:

- its namespace can build concrete plans
- its renderer accepts standard plans
- standard helpers render correctly for that engine
- concrete-only helpers narrow plans to that dialect
- conflicts with other concrete dialects fail at type level
- public executor boundaries reject incompatible untyped plans

## Type-Test Requirements

Type tests are required for type-caused behavior.

Required assertions:

- `MergeDialect<"standard", "standard">` is `"standard"`.
- `MergeDialect<"standard", "postgres">` is `"postgres"`.
- `MergeDialect<"mysql", "standard">` is `"mysql"`.
- `MergeDialect<"postgres", "mysql">` is `DialectConflictError`.
- A standard-only plan has `PlanDialectOf<...> = "standard"`.
- A standard plan using a Postgres expression has `PlanDialectOf<...> =
  "postgres"`.
- A standard plan mixing Postgres and MySQL expressions has
  `PlanDialectOf<...> = DialectConflictError`.
- Postgres renderers accept standard and Postgres-narrowed plans.
- MySQL renderers accept standard and MySQL-narrowed plans.
- SQLite renderers accept standard and SQLite-narrowed plans.
- Renderers reject plans narrowed to a different concrete dialect.
- Renderers reject dialect-conflict plans.

Use `@ts-expect-error` for invalid examples. These tests are part of the
feature, not optional coverage.

## Runtime-Test Requirements

Runtime tests should prove that typed guarantees line up with actual rendering.

Required behavior tests:

- The same standard select renders through Standard, Postgres, MySQL, and
  SQLite renderers.
- Each concrete renderer uses its own identifier quoting and placeholder format.
- Standard literals normalize through the same driver value mapping pipeline as
  concrete literals.
- Standard functions render with engine-specific spelling where needed.
- Standard table references preserve aliases and schemas.
- Standard joins, predicates, grouping, ordering, limits, and CTEs render across
  built-in engines.
- Standard mutation and DDL helpers either render correctly for every claimed
  engine or reject with a clear error.
- Untyped incompatible plans are rejected at the renderer/executor boundary.

When a type check catches a misuse that would otherwise be a runtime bug, that
counts as catching the runtime issue. Add the type test instead of adding a
runtime guard unless untyped data can cross the public boundary.

## Acceptance Criteria

The standard dialect project is complete when:

- `effect-qb/standard` is documented as the portable authoring namespace.
- Standard tables, columns, datatypes, functions, and query builders cover the
  agreed portable SQL subset.
- Standard-only plans render through all built-in concrete renderers.
- Concrete-only constructs narrow standard plans to the concrete dialect.
- Mixed concrete constructs produce type-level dialect conflicts.
- Public renderers and executors reject incompatible untyped plans.
- Type tests cover the dialect lattice and renderer compatibility rules.
- Behavior tests cover standard rendering across Postgres, MySQL, SQLite, and
  the reference standard renderer.
- Package exports expose `effect-qb/standard` with source types and built output.
- Validation passes with:

```sh
bun run test:types
bun test test/public/behavior test/internal/behavior
bun run build
```

## Non-Goals

The standard dialect does not promise:

- identical database semantics for every SQL feature
- emulation of missing engine features
- automatic migration between engine-specific SQL dialects
- support for concrete-only options through `*`
- hiding the need to choose a concrete executor at runtime

If a query depends on concrete database behavior, users should use the concrete
namespace intentionally.
