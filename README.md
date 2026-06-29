# effect-qb

Typed SQL query building for Effect-oriented TypeScript applications.

`effect-qb` lets you define tables once, compose typed query plans, render those
plans for a concrete SQL dialect, and execute them through Effect SQL clients or a
custom driver. It is a query builder, not an ORM: table definitions describe SQL
shape and runtime schemas, while query plans stay explicit and inspectable.

```ts
import { Column, Function, Query, Table } from "effect-qb"
import * as Pg from "effect-qb/postgres"

const users = Table.make("users", {
  id: Column.uuid().pipe(Column.primaryKey),
  email: Column.text(),
  active: Column.boolean()
})

const activeUsers = Query.select({
  id: users.id,
  email: Function.lower(users.email)
}).pipe(
  Query.from(users),
  Query.where(Query.eq(users.active, true)),
  Query.orderBy(users.email)
)

type ActiveUser = Query.ResultRow<typeof activeUsers>
// { readonly id: string; readonly email: string }

// The plan is portable. Here it is rendered for Postgres.
const rendered = Pg.Renderer.make().render(activeUsers)
// rendered.sql:
// select "users"."id" as "id", lower("users"."email") as "email" from "users" where ("users"."active" = $1) order by "users"."email" asc
```

Columns reference their own table (`users.id`), so a query starts with
`Query.select(...)` and pipes `from`, `where`, and `orderBy` onto it. The order
of the piped steps does not change the SQL that is generated.

## Contents

- [Getting Started](#getting-started)
  - [Install](#install)
  - [Quick Start](#quick-start)
- [Core Concepts](#core-concepts)
  - [How effect-qb Works](#how-effect-qb-works)
  - [Defining Tables](#defining-tables)
  - [Column Types and Runtime Schemas](#column-types-and-runtime-schemas)
  - [Casing and Naming](#casing-and-naming)
- [Type Safety](#type-safety)
  - [Table Shape and Payloads](#table-shape-and-payloads)
  - [Conflict Targets](#conflict-targets)
  - [Result Rows and Predicate Facts](#result-rows-and-predicate-facts)
  - [JSON and JSONB Paths](#json-and-jsonb-paths)
  - [Casting and Type Comparison](#casting-and-type-comparison)
  - [Source Completeness and Aliases](#source-completeness-and-aliases)
  - [Dialect Compatibility](#dialect-compatibility)
  - [Runtime Boundaries](#runtime-boundaries)
- [Query Lifecycle](#query-lifecycle)
  - [Writing Queries](#writing-queries)
  - [Rendering SQL](#rendering-sql)
  - [Executing Queries](#executing-queries)
- [Dialects](#dialects)
  - [Portable Standard Surface](#portable-standard-surface)
  - [Postgres](#postgres)
  - [MySQL](#mysql)
  - [SQLite](#sqlite)
- [Recipes](#recipes)
- [Guarantees and Boundaries](#guarantees-and-boundaries)
  - [Limitations](#limitations)
  - [Companion Package: effect-db](#companion-package-effect-db)
- [Reference](#reference)
  - [API Map](#api-map)
  - [Development](#development)

## Getting Started

### Install

```sh
bun add effect-qb effect
```

Runtime requirements:

- Node.js `>=22`
- Bun `>=1.3.5` for this repository's development scripts

Public query-builder import paths:

- `effect-qb` - portable table, column, table-option, query, function, renderer, and casing modules
- `effect-qb/postgres` - Postgres column extensions, option modifiers, renderer, executor, schema helpers
- `effect-qb/mysql` - MySQL extensions, renderer, executor
- `effect-qb/sqlite` - SQLite extensions, renderer, executor

### Quick Start

Define a table, build a query, derive its result-row type, then render the one
plan for each dialect. The plan does not change between dialects; only the
rendered SQL does.

```ts
import { Column, Function, Query, Table } from "effect-qb"
import * as My from "effect-qb/mysql"
import * as Pg from "effect-qb/postgres"
import * as Sq from "effect-qb/sqlite"

const users = Table.make("users", {
  id: Column.uuid().pipe(Column.primaryKey),
  email: Column.text(),
  displayName: Column.text(),
  active: Column.boolean()
})

const activeUsers = Query.select({
  id: users.id,
  email: Function.lower(users.email),
  displayName: users.displayName
}).pipe(
  Query.from(users),
  Query.where(Query.eq(users.active, true)),
  Query.orderBy(users.email)
)

type ActiveUserRow = Query.ResultRow<typeof activeUsers>
// {
//   readonly id: string
//   readonly email: string
//   readonly displayName: string
// }

const postgres = Pg.Renderer.make().render(activeUsers)
// select "users"."id" as "id", lower("users"."email") as "email", "users"."displayName" as "displayName" from "users" where ("users"."active" = $1) order by "users"."email" asc

const mysql = My.Renderer.make().render(activeUsers)
// select `users`.`id` as `id`, lower(`users`.`email`) as `email`, `users`.`displayName` as `displayName` from `users` where (`users`.`active` = ?) order by `users`.`email` asc

const sqlite = Sq.Renderer.make().render(activeUsers)
// select "users"."id" as "id", lower("users"."email") as "email", "users"."displayName" as "displayName" from "users" where ("users"."active" = ?) order by "users"."email" asc
```

This plan is portable because it only uses root `effect-qb` modules. Reach for a
dialect module (`effect-qb/postgres`, etc.) only when a query depends on that
dialect's SQL.

## Core Concepts

### How effect-qb Works

`effect-qb` is built around a small pipeline:

```text
Table + Column definitions
  -> typed Query plan
  -> dialect Renderer
  -> SQL + params + projection metadata
  -> dialect Executor
  -> decoded typed rows
```

- `Column` carries SQL type metadata, runtime schema information, nullability,
  defaults, generated metadata, and driver value mapping hints.
- `Table` carries table identity, fields, primary key metadata, schema metadata,
  constraints, indexes, and derived select/insert/update schemas.
- `Query` creates typed plans. Plans track source requirements, result rows,
  capabilities, and dialect compatibility.
- `Renderer` turns a compatible complete plan into `sql`, `params`,
  `dialect`, `projections`, and optional `valueMappings`.
- `Executor` runs rendered plans and uses projection metadata plus runtime
  schemas to normalize and decode rows.

The root namespace is the standard portable authoring layer. Dialect-specific
helpers narrow a plan to that concrete dialect. Mixing two different concrete
dialects is rejected at type level.

<details>
<summary>Standard versus concrete dialects</summary>

A plan that only uses `effect-qb` root modules has the standard dialect tag.
Standard plans can render through Postgres, MySQL, and SQLite renderers.

If a plan uses `Pg.Column.jsonb(...)`, `Jsonb.*` from `effect-qb/postgres`, or a standard table
option piped through a Postgres modifier such as `Pg.Index.using("btree")`,
it becomes a Postgres plan. Render and execute that plan with the Postgres
renderer or executor.

MySQL and SQLite follow the same rule: use root modules for portable SQL, and
concrete modules only when the query depends on concrete SQL.

</details>

### Defining Tables

`Table.make` is the primary table factory.

```ts
import { Check, Column, ForeignKey, Index, PrimaryKey, Query, Table, Unique } from "effect-qb"

const organizations = Table.make("organizations", {
  id: Column.uuid().pipe(Column.primaryKey),
  name: Column.text(),
  archivedAt: Column.datetime().pipe(Column.nullable)
})

const memberships = Table.make("memberships", {
  orgId: Column.uuid(),
  userId: Column.uuid(),
  role: Column.text()
}).pipe(
  // (local columns on this table, referenced columns on the other table)
  ForeignKey.make((table) => table.orgId, () => organizations.id),
  PrimaryKey.make((table) => [table.orgId, table.userId]),
  Unique.make((table) => [table.orgId, table.role]),
  Check.make(
    "memberships_role_check",
    (table) => Query.neq(table.role, "")
  ),
  Index.make((table) => table.userId)
)

type Membership = Table.SelectOf<typeof memberships>
// { readonly orgId: string; readonly userId: string; readonly role: string }

type NewMembership = Table.InsertOf<typeof memberships>
// { readonly orgId: string; readonly userId: string; readonly role: string }

type MembershipPatch = Table.UpdateOf<typeof memberships>
// { readonly role?: string } — the composite primary key is omitted from updates

```

Root option modules cover portable constraints and metadata:

- `PrimaryKey.make(...)`
- `Unique.make(...)`
- `Index.make(...)`
- `ForeignKey.make(...)`
- `Check.make(...)`

`Table` keeps table construction and row/schema helpers:

- `Table.alias(...)`
- `Table.selectSchema(...)`, `Table.insertSchema(...)`, `Table.updateSchema(...)`

<details>
<summary>Class-style tables</summary>

`Table.Class` exists for class-style declarations and advanced schema-centric
workflows. Prefer `Table.make` unless your codebase already uses class-style
table definitions.

```ts
import { Column, Index, Table } from "effect-qb"

class Users extends Table.Class<Users>("users")({
  id: Column.uuid().pipe(Column.primaryKey),
  email: Column.text(),
  displayName: Column.text().pipe(Column.nullable)
}) {
  static readonly [Table.options] = [
    Index.make((table) => table.email).pipe(Index.named("users_email_idx"))
  ]
}

const usersByEmail = Users.email
```

</details>

### Column Types and Runtime Schemas

The portable column surface includes:

- `uuid`
- `text`, `varchar`, `char`
- `int`, `bigint`, `number`, `real`
- `boolean`
- `date`, `time`, `datetime`, `timestamp`
- `blob`
- `json`

Columns can refine their select/insert/update schemas.

```ts
import * as Schema from "effect/Schema"
import { Column, Table } from "effect-qb"

const events = Table.make("events", {
  id: Column.uuid().pipe(Column.primaryKey),
  happenedOn: Column.date().pipe(Column.schema(Schema.DateFromString)),
  payload: Column.json(Schema.Struct({
    visits: Schema.Number
  }))
})

type EventRow = Table.SelectOf<typeof events>
// {
//   readonly id: string
//   readonly happenedOn: Date          // decoded by Schema.DateFromString
//   readonly payload: { readonly visits: number }
// }

type EventInsert = Table.InsertOf<typeof events>

```

Postgres adds concrete types such as `jsonb`, `bytea`, arrays, identity
columns, timestamp variants, and custom typed references or `Cast.to(...)`
targets.

### Casing and Naming

Use `Casing` when model identifiers and physical database identifiers do not
use the same naming convention.

Casing is usually a renderer concern: pipe `Casing.withCasing(...)` into a
built-in renderer to map physical table, column, schema, index, constraint,
type, and sequence names without changing model keys.

```ts
import { Casing, Column, Query, Table } from "effect-qb"
import * as Pg from "effect-qb/postgres"

const users = Table.make("UserAccounts", {
  id: Column.uuid().pipe(Column.primaryKey),
  createdAt: Column.datetime(),
  displayName: Column.text()
})

const readUsers = Query.select({
  createdAt: users.createdAt
}).pipe(
  Query.from(users),
  Query.where(Query.eq(users.displayName, "Ada"))
)

const renderer = Pg.Renderer.make().pipe(
  Casing.withCasing("snake_case")
)

const rendered = renderer.render(readUsers)
// model keys stay as written; physical identifiers are snake_case:
// select "user_accounts"."created_at" as "createdAt" from "user_accounts" where ("user_accounts"."display_name" = $1)
```

<details>
<summary>Override casing for one table</summary>

```ts
import { Casing, Column, Table } from "effect-qb"

const users = Table.make("UserAccounts", {
  id: Column.uuid().pipe(Column.primaryKey),
  createdAt: Column.datetime()
}).pipe(
  Casing.withCasing("snake_case")
)

```

</details>

<details>
<summary>Create a casing-aware table factory</summary>

```ts
import { Casing, Column } from "effect-qb"

const Snake = Casing.make("snake_case")

const users = Snake.table("UserAccounts", {
  id: Column.uuid().pipe(Column.primaryKey),
  createdAt: Column.datetime()
})

```

</details>

<details>
<summary>Apply casing to a Postgres schema factory</summary>

```ts
import { Casing, Column } from "effect-qb"
import * as Pg from "effect-qb/postgres"

const Analytics = Pg.Schema.make("analytics").pipe(
  Casing.withCasing({
    tables: "snake_case",
    columns: "snake_case",
    types: "snake_case",
    sequences: "snake_case"
  })
)

const events = Analytics.table("Events", {
  id: Column.uuid().pipe(Column.primaryKey),
  createdAt: Column.datetime()
})

```

</details>

<details>
<summary>Casing categories and styles</summary>

Casing categories:

- `tables`
- `columns`
- `schemas`
- `indexes`
- `constraints`
- `types`
- `sequences`

Built-in casing styles:

- `"preserve"`
- `"snake_case"`
- `"camelCase"`
- `"PascalCase"`
- `"kebab-case"`
- `"SCREAMING_SNAKE_CASE"`
- `(name: string) => string`

</details>

## Type Safety

`effect-qb` pushes checks into TypeScript when the public API has enough
information to know the answer before SQL is rendered. The main idea is that
tables, columns, predicates, source availability, and dialects all carry type
metadata through the plan.

> If you just want to write, render, and execute queries end to end, skip ahead
> to [Query Lifecycle](#query-lifecycle). This section explains what TypeScript
> catches for you before any SQL runs.

### Table Shape and Payloads

Table definitions derive select, insert, and update payloads from column
metadata. Generated columns are omitted from inserts, nullable/default columns
become optional for inserts, and primary keys are omitted from updates.

```ts
import { Column, Query, Table } from "effect-qb"

const users = Table.make("users", {
  id: Column.uuid().pipe(
    Column.primaryKey,
    Column.generated(Query.literal("generated-user-id"))
  ),
  email: Column.text(),
  displayName: Column.text().pipe(Column.nullable)
})

type UserInsert = Table.InsertOf<typeof users>
// {
//   readonly email: string
//   readonly displayName?: string | null
// }
// id is omitted because it is generated.

type UserUpdate = Table.UpdateOf<typeof users>
// {
//   readonly email?: string
//   readonly displayName?: string | null
// }
// id is omitted because primary keys are not updated.

const insertWithId: UserInsert = {
  // @ts-expect-error generated primary keys are not insert payload fields
  id: "550e8400-e29b-41d4-a716-446655440000",
  email: "ada@example.com"
}

const updateWithId: UserUpdate = {
  // @ts-expect-error primary keys are not update payload fields
  id: "550e8400-e29b-41d4-a716-446655440000"
}
```

The same column metadata also produces Effect Schemas for runtime validation,
so the parsed types match the `InsertOf`/`UpdateOf` types above.

```ts
import * as Schema from "effect/Schema"
import { Column, Query, Table } from "effect-qb"

const users = Table.make("users", {
  id: Column.uuid().pipe(
    Column.primaryKey,
    Column.generated(Query.literal("generated-user-id"))
  ),
  email: Column.text(),
  displayName: Column.text().pipe(Column.nullable)
})

const insertSchema = Table.insertSchema(users)
const updateSchema = Table.updateSchema(users)

const parsedInsert = Schema.decodeUnknownSync(insertSchema)({
  email: "ada@example.com"
})
const parsedUpdate = Schema.decodeUnknownSync(updateSchema)({
  displayName: null
})

type UserInsertFromSchema = Schema.Schema.Type<typeof insertSchema>
// same shape as UserInsert
type UserUpdateFromSchema = Schema.Schema.Type<typeof updateSchema>
// same shape as UserUpdate
```

`table.schemas.select`, `table.schemas.insert`, and `table.schemas.update`
expose the same schemas, so Effect Schema validation and TypeScript payload
types stay aligned.

### Conflict Targets

`onConflict` and `upsert` column targets must match table arbiter metadata:
a primary key, unique constraint, or unconditional unique index. This catches
ordinary columns before rendering SQL.

```ts
import { Column, Query, Table } from "effect-qb"

const users = Table.make("users", {
  id: Column.uuid().pipe(Column.primaryKey),
  email: Column.text().pipe(Column.unique),
  displayName: Column.text()
})

const draftUsers = Table.make("draft_users", {
  id: Column.uuid().pipe(Column.primaryKey),
  email: Column.text(),
  displayName: Column.text()
})

// users.email is unique, so it is a valid conflict target.
Query.insert(users, {
  id: "user-id",
  email: "ada@example.com",
  displayName: "Ada"
}).pipe(Query.onConflict("email", {
  update: {
    displayName: Query.excluded(users.displayName)
  }
}))

// draft_users.email has no unique constraint, so it is rejected.
Query.insert(draftUsers, {
  id: "draft-id",
  email: "draft@example.com",
  displayName: "Draft"
}).pipe(
  // @ts-expect-error conflict targets must match a primary key, unique constraint, or unique index
  Query.onConflict("email", {
    update: {
      displayName: Query.excluded(draftUsers.displayName)
    }
  })
)
```

`Query.upsert(table, values, target, update)` is shorthand for an insert with a
single-column `onConflict`, and checks the target the same way.

### Result Rows and Predicate Facts

`Query.ResultRow<typeof plan>` is the canonical row type for a plan. It is not
only the projection shape: it also includes facts introduced by joins and
predicates. Left-joined sources become nullable until a predicate proves the
source is present, and predicates such as `isNotNull`, `eq`, `in`, and
`notIn` narrow selected values.

```ts
import { Column, Function, Query, Table } from "effect-qb"

const users = Table.make("users", {
  id: Column.uuid().pipe(Column.primaryKey),
  email: Column.text()
})

const posts = Table.make("posts", {
  id: Column.uuid().pipe(Column.primaryKey),
  userId: Column.uuid(),
  title: Column.text().pipe(Column.nullable),
  publishedAt: Column.datetime().pipe(Column.nullable)
})

const visiblePosts = Query.select({
  userId: users.id,
  postId: posts.id,
  title: posts.title,
  upperTitle: Function.upper(posts.title)
}).pipe(
  Query.from(users),
  Query.leftJoin(posts, Query.eq(users.id, posts.userId)),
  Query.where(Query.isNotNull(posts.title))
)

type VisiblePostRow = Query.ResultRow<typeof visiblePosts>
// {
//   readonly userId: string
//   readonly postId: string
//   readonly title: string      // isNotNull(posts.title) proves this is not null
//   readonly upperTitle: string
// }
// The title predicate also proves the left-joined posts row exists, so postId is string.

```

Literal predicates can narrow finite unions too. This applies to ordinary
columns and to selected expressions that retain enough path metadata.

```ts
import * as Schema from "effect/Schema"
import { Column, Json, Query, Table } from "effect-qb"

const payloadSchema = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("created"),
    actorId: Schema.String
  }),
  Schema.Struct({
    kind: Schema.Literal("deleted"),
    reason: Schema.String
  })
])

const events = Table.make("events", {
  id: Column.uuid().pipe(Column.primaryKey),
  payload: Column.json(payloadSchema)
})

const kind = events.payload.kind.pipe(Json.text)

const createdEvents = Query.select({
  payload: events.payload,
  kind
}).pipe(
  Query.from(events),
  Query.where(Query.eq(kind, "created"))
)

type CreatedEventRow = Query.ResultRow<typeof createdEvents>
// {
//   readonly payload: {
//     readonly kind: "created"
//     readonly actorId: string
//   }
//   readonly kind: "created"
// }
// The discriminator equality removes the deleted payload branch.

```

These refinements are implemented by the predicate implication layer. It tracks
which column and JSON-path facts are guaranteed, which optional sources have
been promoted, and which row shapes are impossible under the current
assumptions.

### JSON and JSONB Paths

A JSON column carries its Effect Schema type through property-path access, so
schema-known keys are reached with ordinary property access and keep their type.
Use root `Json` for portable `Column.json(...)` columns and `Pg.Jsonb` for
Postgres `jsonb` columns; the path shape is identical.

```ts
import * as Schema from "effect/Schema"
import { Cast, Column, Json, Query, Scalar, Table } from "effect-qb"
import { Jsonb } from "effect-qb/postgres"
import * as Pg from "effect-qb/postgres"

const payloadSchema = Schema.Struct({
  profile: Schema.Struct({
    address: Schema.Struct({
      city: Schema.String
    }),
    metrics: Schema.Struct({
      count: Schema.Number
    }),
    legacyName: Schema.optional(Schema.String),
    legacySlug: Schema.optional(Schema.String)
  })
})

const docs = Table.make("docs", {
  id: Column.uuid().pipe(Column.primaryKey),
  payload: Pg.Column.jsonb(payloadSchema)
})

const portableDocs = Table.make("portable_docs", {
  id: Column.uuid().pipe(Column.primaryKey),
  payload: Column.json(payloadSchema)
})

// Postgres jsonb and portable json share the same property-path API.
const city = docs.payload.profile.address.city.pipe(Jsonb.text)
const portableCity = portableDocs.payload.profile.address.city.pipe(Json.text)

type City = Scalar.RuntimeOf<typeof city>
// string
```

`Json.text` and `Jsonb.text` extract SQL text. They do not parse JSON numbers
into JavaScript numbers, so cast a schema-known numeric path when you need
numeric SQL semantics.

```ts
const count = Cast.to(docs.payload.profile.metrics.count, Pg.Type.float8())

type Count = Scalar.RuntimeOf<typeof count>
// number
```

Key checks and deletes use the same paths. Deleting a path that the column
schema requires makes the value stop matching that schema, which TypeScript
rejects before the update is built.

```ts
const legacyNameExists = docs.payload.profile.pipe(Jsonb.hasKey("legacyName"))
const countPathExists = docs.payload.profile.metrics.count.pipe(Jsonb.pathExists)

const missingRequiredCity = docs.payload.profile.address.city.pipe(Jsonb.delete)

Query.update(docs, {
  // @ts-expect-error payload no longer satisfies payloadSchema
  payload: missingRequiredCity
})

// Deleting several paths is a sequence of terminal deletes. Each step operates
// on the value returned by the previous delete, not on the original payload.
const withoutLegacyFields = docs.payload.pipe(
  (payload) => payload.profile.legacyName.pipe(Jsonb.delete),
  (afterNameDelete) => afterNameDelete.profile.legacySlug.pipe(Jsonb.delete)
)
```

The same property-path shape works with root `Json.delete` for portable
`Column.json(...)` values. Reach for `Json.key(...)` / `Jsonb.key(...)` only
when a path segment cannot be written as a normal property, such as a dynamic,
invalid-identifier, or reserved JSON key.

### Casting and Type Comparison

`Cast.to` converts an expression to another type and checks the conversion at
compile time. Comparisons read the same type-family metadata, so a cast is also
how you bridge two values that belong to different families.

```ts
import { Cast, Column, Query, Table } from "effect-qb"

const events = Table.make("events", {
  id: Column.uuid().pipe(Column.primaryKey),
  externalRef: Column.text()
})

// id (uuid) and externalRef (text) are different comparison families, so cast
// one side to compare them.
const idAsText = Cast.to(events.id, Query.type.text())
const sameRef = Query.eq(idAsText, events.externalRef)

// @ts-expect-error uuid and text are different comparison families
Query.eq(events.id, events.externalRef)
```

Portable target types come from `Query.type` (such as `Query.type.text()`);
dialect-specific targets come from the dialect module (such as
`Pg.Type.float8()`). `Query.type` does not expose dialect types, and dialect
modules do not re-expose portable ones, so each rejects the other's witnesses.
A compatible cast or comparison resolves before any SQL is rendered; an
incompatible one fails at compile time.

<details>
<summary>Casts the type checker rejects</summary>

A schema-known JSONB value can only cast to a compatible family. A numeric path
casts to a numeric type, but objects and strings do not.

```ts
import * as Schema from "effect/Schema"
import { Cast, Column, Table } from "effect-qb"
import * as Pg from "effect-qb/postgres"

const docs = Table.make("docs", {
  id: Column.uuid().pipe(Column.primaryKey),
  payload: Pg.Column.jsonb(Schema.Struct({
    metrics: Schema.Struct({ count: Schema.Number }),
    address: Schema.Struct({ city: Schema.String })
  }))
})

// @ts-expect-error a JSONB object cannot be cast to a numeric type
Cast.to(docs.payload.metrics, Pg.Type.float8())

// @ts-expect-error a JSONB string cannot be cast to a numeric type
Cast.to(docs.payload.address.city, Pg.Type.float8())
```

</details>

### Source Completeness and Aliases

Plans track which sources they reference. An incomplete plan is still
composable, but rendering, execution, CTEs, and derived sources all require a
complete plan.

```ts
import { Column, Query, Renderer, Table } from "effect-qb"

const users = Table.make("users", {
  id: Column.uuid().pipe(Column.primaryKey),
  email: Column.text()
})

const incomplete = Query.select({
  email: users.email
})

// @ts-expect-error renderable plans must include every referenced source
Renderer.make().render(incomplete)

const complete = incomplete.pipe(Query.from(users))
const rendered = Renderer.make().render(complete)

type RenderedRow = Renderer.RowOf<typeof rendered>
// {
//   readonly email: string
// }
```

Derived-source aliases must be literal, non-empty strings, so result paths and
source identity stay stable.

```ts
const activeUsers = Query.as(complete, "active_users")

const dynamicAlias: string = "users_alias"

// @ts-expect-error derived source aliases must be literal strings
Query.as(complete, dynamicAlias)

// @ts-expect-error derived source aliases must be non-empty
Query.as(complete, "")
```

### Dialect Compatibility

Root `effect-qb` queries start on the portable standard surface. Dialect
helpers narrow a plan to a concrete dialect, and renderers/executors only accept
plans compatible with their dialect.

```ts
import * as Schema from "effect/Schema"
import { Column, Query, Table } from "effect-qb"
import { Jsonb } from "effect-qb/postgres"
import * as My from "effect-qb/mysql"
import * as Pg from "effect-qb/postgres"
import * as Sq from "effect-qb/sqlite"

const users = Table.make("users", {
  id: Column.uuid().pipe(Column.primaryKey),
  email: Column.text()
})

const portable = Query.select({
  id: users.id,
  email: users.email
}).pipe(Query.from(users))

// A portable plan renders through every dialect.
Pg.Renderer.make().render(portable)
My.Renderer.make().render(portable)
Sq.Renderer.make().render(portable)

const docs = Table.make("docs", {
  id: Column.uuid().pipe(Column.primaryKey),
  payload: Pg.Column.jsonb(Schema.Struct({
    kind: Schema.String
  }))
})

// Pg.Column.jsonb narrows this plan to Postgres.
const postgresOnly = Query.select({
  kind: docs.payload.kind.pipe(Jsonb.text)
}).pipe(Query.from(docs))

Pg.Renderer.make().render(postgresOnly)

// @ts-expect-error Postgres jsonb plans are not MySQL-compatible
My.Renderer.make().render(postgresOnly)
```

The same compatibility checks apply to set operators, subqueries, mutation
filters, mutation values, executors, and renderer/executor `valueMappings`.
Mapping keys are checked against known type names, type families, and runtime
keys for the selected dialect.

### Runtime Boundaries

TypeScript can reject structurally impossible plans, but it cannot prove that a
live database matches your table definitions. Runtime validation still matters
at these boundaries:

- renderer construction and dialect-specific SQL serialization
- driver execution and driver value mappings
- row decoding through each projection schema
- custom SQL fragments, casts, and declared database metadata
- database constraints and migrations outside this package

If a driver returns a value that does not satisfy the projection schema,
`Executor` fails during decode instead of pretending the row is typed.

## Query Lifecycle

### Writing Queries

Queries are ordinary values. Compose them with `.pipe(...)`.

```ts
import { Column, Function, Query, Table } from "effect-qb"

const users = Table.make("users", {
  id: Column.uuid().pipe(Column.primaryKey),
  email: Column.text()
})

const posts = Table.make("posts", {
  id: Column.uuid().pipe(Column.primaryKey),
  userId: Column.uuid(),
  title: Column.text().pipe(Column.nullable),
  publishedAt: Column.datetime().pipe(Column.nullable)
})

const postsByUser = Query.select({
  userId: users.id,
  email: users.email,
  postCount: Function.count(posts.id)
}).pipe(
  Query.from(users),
  Query.innerJoin(posts, Query.eq(users.id, posts.userId)),
  Query.where(Query.isNotNull(posts.publishedAt)),
  Query.groupBy(users.id, users.email),
  Query.orderBy(users.email)
)

type PostsByUserRow = Query.ResultRow<typeof postsByUser>
// {
//   readonly userId: string
//   readonly email: string
//   readonly postCount: number
// }

```

Core query surfaces include:

- `select`, `from`, joins, aliases, derived sources, and CTEs
- predicates such as `eq`, `and`, `or`, `isNull`, `isNotNull`, `exists`
- grouping, ordering, distinct, limit, and offset
- inserts, updates, deletes, merge, upsert, and returning where supported
- set operators
- transaction helpers such as savepoints

The blocks below showcase the surfaces beyond the basic read above.

<details>
<summary>Predicate combinators</summary>

Combine predicates with `and`/`or`; `between`, `in`, `notIn`, `isNull`, and
`isNotNull` cover the common shapes.

```ts
import { Column, Query, Table } from "effect-qb"

const users = Table.make("users", {
  id: Column.int().pipe(Column.primaryKey),
  email: Column.text().pipe(Column.nullable),
  status: Column.text()
})

const filtered = Query.select({ id: users.id }).pipe(
  Query.from(users),
  Query.where(Query.and(
    Query.between(users.id, 1, 100),
    Query.or(
      Query.in(users.status, "active", "archived"),
      Query.isNull(users.email)
    )
  ))
)
```

</details>

<details>
<summary>Conditional expressions (case / match)</summary>

`case` builds a searched CASE; `match` builds a simple CASE over one expression.

```ts
import { Column, Query, Table } from "effect-qb"

const users = Table.make("users", {
  id: Column.uuid().pipe(Column.primaryKey),
  status: Column.text()
})

const labelled = Query.select({
  id: users.id,
  tier: Query.case()
    .when(Query.eq(users.status, "active"), "current")
    .else("other"),
  label: Query.match(users.status)
    .when("active", "Active")
    .when("archived", "Archived")
    .else("Unknown")
}).pipe(Query.from(users))
```

</details>

<details>
<summary>Functions and aggregates</summary>

```ts
import { Column, Function, Query, Table } from "effect-qb"

const users = Table.make("users", {
  id: Column.uuid().pipe(Column.primaryKey),
  email: Column.text()
})

const posts = Table.make("posts", {
  id: Column.uuid().pipe(Column.primaryKey),
  userId: Column.uuid(),
  title: Column.text().pipe(Column.nullable)
})

const postCount = Function.count(posts.id)

const report = Query.select({
  label: Function.concat(Function.lower(users.email), "-user"),
  postCount,
  latestTitle: Function.max(posts.title)
}).pipe(
  Query.from(users),
  Query.leftJoin(posts, Query.eq(users.id, posts.userId)),
  Query.groupBy(users.email),
  Query.having(Query.gt(postCount, 0))
)
// select (lower("users"."email") || $1) as "label", count("posts"."id") as "postCount", max("posts"."title") as "latestTitle" from "users" left join "posts" on ("users"."id" = "posts"."userId") group by "users"."email" having (count("posts"."id") > $2)
```

</details>

<details>
<summary>Common table expressions</summary>

Pipe `Query.with(name)` onto a complete plan to name it, then reference it like
any other source. `Query.withRecursive(name)` builds recursive CTEs.

```ts
import { Column, Query, Table } from "effect-qb"

const users = Table.make("users", {
  id: Column.uuid().pipe(Column.primaryKey),
  email: Column.text()
})

const posts = Table.make("posts", {
  id: Column.uuid().pipe(Column.primaryKey),
  userId: Column.uuid(),
  title: Column.text().pipe(Column.nullable)
})

const activePosts = Query.select({
  userId: posts.userId,
  title: posts.title
}).pipe(
  Query.from(posts),
  Query.where(Query.isNotNull(posts.title)),
  Query.with("active_posts")
)

const usersWithActivePosts = Query.select({
  email: users.email,
  title: activePosts.title
}).pipe(
  Query.from(users),
  Query.innerJoin(activePosts, Query.eq(users.id, activePosts.userId))
)
// with "active_posts" as (select "posts"."userId" as "userId", "posts"."title" as "title" from "posts" where ("posts"."title" is not null)) select "users"."email" as "email", "active_posts"."title" as "title" from "users" inner join "active_posts" on ("users"."id" = "active_posts"."userId")
```

</details>

<details>
<summary>Subqueries (correlated exists)</summary>

A subquery correlates with the outer query by referencing its columns.
`Query.exists`, `Query.inSubquery`, `Query.scalar`, `Query.compareAny`, and
`Query.compareAll` all take a select plan.

```ts
import { Column, Query, Table } from "effect-qb"

const users = Table.make("users", {
  id: Column.uuid().pipe(Column.primaryKey),
  email: Column.text()
})

const posts = Table.make("posts", {
  id: Column.uuid().pipe(Column.primaryKey),
  userId: Column.uuid()
})

const userPosts = Query.select({ value: posts.id }).pipe(
  Query.from(posts),
  Query.where(Query.eq(posts.userId, users.id))
)

const authors = Query.select({
  email: users.email,
  hasPosts: Query.exists(userPosts)
}).pipe(Query.from(users))
```

</details>

<details>
<summary>Set operators</summary>

`union`, `unionAll`, `intersect`, `intersectAll`, `except`, and `exceptAll`
combine two source-complete selects that share a projection shape — useful for
stitching together independent queries. The minimal example below splits one
table by a flag so the two shapes are obviously identical.

```ts
import { Column, Query, Table } from "effect-qb"

const users = Table.make("users", {
  id: Column.uuid().pipe(Column.primaryKey),
  email: Column.text(),
  active: Column.boolean()
})

const activeEmails = Query.select({ email: users.email }).pipe(
  Query.from(users),
  Query.where(Query.eq(users.active, true))
)

const inactiveEmails = Query.select({ email: users.email }).pipe(
  Query.from(users),
  Query.where(Query.eq(users.active, false))
)

const allEmails = Query.unionAll(activeEmails, inactiveEmails)
// (select "users"."email" as "email" from "users" where ("users"."active" = $1)) union all (select "users"."email" as "email" from "users" where ("users"."active" = $2))
```

</details>

<details>
<summary>Window functions</summary>

`Function.rowNumber`, `rank`, and `denseRank` take a window spec;
`Function.over` wraps an aggregate in a window.

```ts
import { Column, Function, Query, Table } from "effect-qb"

const posts = Table.make("posts", {
  id: Column.uuid().pipe(Column.primaryKey),
  userId: Column.uuid()
})

const ranked = Query.select({
  postId: posts.id,
  rowInUser: Function.rowNumber({
    partitionBy: [posts.userId],
    orderBy: [{ value: posts.id, direction: "asc" }]
  }),
  perUser: Function.over(Function.count(posts.id), {
    partitionBy: [posts.userId]
  })
}).pipe(Query.from(posts))
```

</details>

<details>
<summary>Merge</summary>

```ts
import { Column, Query, Table } from "effect-qb"

const users = Table.make("users", {
  id: Column.uuid().pipe(Column.primaryKey),
  email: Column.text()
})

const incoming = Table.make("incoming_users", {
  id: Column.uuid().pipe(Column.primaryKey),
  email: Column.text()
})

const merge = Query.merge(users, incoming, Query.eq(users.id, incoming.id), {
  whenMatched: { update: { email: incoming.email } },
  whenNotMatched: { values: { id: incoming.id, email: incoming.email } }
})
// merge into "users" using "incoming_users" on ("users"."id" = "incoming_users"."id") when matched then update set "email" = "incoming_users"."email" when not matched then insert ("id", "email") values ("incoming_users"."id", "incoming_users"."email")
```

</details>

<details>
<summary>Transactions and savepoints</summary>

Prefer `Executor.withTransaction` for scoped transaction composition. A nested
`withTransaction` call uses the underlying transaction implementation's
savepoint behavior.

```ts
import { Effect } from "effect"
import { Column, Query, Table } from "effect-qb"
import * as Pg from "effect-qb/postgres"

const memberships = Table.make("memberships", {
  id: Column.text().pipe(Column.primaryKey),
  role: Column.text()
})

const auditLogs = Table.make("audit_logs", {
  id: Column.text().pipe(Column.primaryKey),
  membershipId: Column.text(),
  note: Column.text()
})

const executor = Pg.Executor.make()

const insertMembership = Query.insert(memberships, {
  id: "membership-1",
  role: "admin"
})

const updateAuditLog = Query.update(auditLogs, {
  note: "membership written"
}).pipe(
  Query.where(Query.eq(auditLogs.membershipId, "membership-1"))
)

const readMembership = Query.select({
  id: memberships.id,
  role: memberships.role
}).pipe(
  Query.from(memberships),
  Query.where(Query.eq(memberships.id, "membership-1"))
)

const writeMembership = Effect.gen(function*() {
  yield* executor.execute(insertMembership)

  // nested transaction uses a savepoint
  yield* executor.execute(updateAuditLog).pipe(Pg.Executor.withTransaction)

  return yield* executor.execute(readMembership)
}).pipe(Pg.Executor.withTransaction)
```

Low-level transaction-control helpers build statements you issue through an
executor yourself: begin a transaction, optionally mark and roll back to
savepoints, then commit.

```ts
import { Query } from "effect-qb"

const begin = Query.transaction({ isolationLevel: "serializable" })
const savepoint = Query.savepoint("before_merge")
const rollbackToSavepoint = Query.rollbackTo("before_merge")
const releaseSavepoint = Query.releaseSavepoint("before_merge")
const commit = Query.commit()
```

</details>

<details>
<summary>DDL (create / drop)</summary>

```ts
import { Column, Query, Table } from "effect-qb"

const users = Table.make("users", {
  id: Column.uuid().pipe(Column.primaryKey),
  email: Column.text()
})

const createUsers = Query.createTable(users)
// create table "users" ("id" uuid not null, "email" text not null, primary key ("id"))

const createEmailIndex = Query.createIndex(users, ["email"], {
  name: "users_email_idx"
})
// create index "users_email_idx" on "users" ("email")

const dropEmailIndex = Query.dropIndex(users, ["email"], {
  name: "users_email_idx"
})
```

</details>

<details>
<summary>Mutation example</summary>

```ts
import { Column, Query, Table } from "effect-qb"

const users = Table.make("users", {
  id: Column.uuid().pipe(Column.primaryKey),
  email: Column.text(),
  visits: Column.int()
})

const insertUser = Query.insert(users, {
  id: "11111111-1111-1111-1111-111111111111",
  email: "alice@example.com",
  visits: 1
})

const incrementVisits = Query.update(users, {
  visits: 2
}).pipe(
  Query.where(Query.eq(users.email, "alice@example.com"))
)

```

</details>

### Rendering SQL

Each built-in renderer exposes `make(options?)` and `render(plan)`.

```ts
import { Column, Query, Table } from "effect-qb"
import * as Pg from "effect-qb/postgres"

const users = Table.make("users", {
  id: Column.uuid().pipe(Column.primaryKey),
  email: Column.text()
})

const readUsers = Query.select({
  id: users.id,
  email: users.email
}).pipe(Query.from(users))

const rendered = Pg.Renderer.make().render(readUsers)

// rendered.sql:
// select "users"."id" as "id", "users"."email" as "email" from "users"
// rendered.params:
// []

```

Renderer options:

- `valueMappings?` - typed driver-boundary mappings by known datatype or datatype family

`valueMappings` is keyed by the renderer's known type surface. Unknown keys are
type errors.

```ts
import { Scalar } from "effect-qb"
import * as Pg from "effect-qb/postgres"

// The pg driver returns int8 (bigint) columns as strings. Decode them to a
// JavaScript BigInt on the way out, and encode back to a string on the way in.
const bigintAsString: Scalar.DriverValueMapping = {
  fromDriver: (value) => typeof value === "string" ? BigInt(value) : value,
  toDriver: (value) => typeof value === "bigint" ? value.toString() : value
}

const renderer = Pg.Renderer.make({
  valueMappings: {
    int8: bigintAsString
  }
})

```

<details>
<summary>Rendered output shape</summary>

A rendered query contains:

- `sql`
- `params`
- `dialect`
- `projections`
- optional `valueMappings`

Executors use the projection metadata to decode flat driver rows back into the
nested result shape described by the query plan.

</details>

### Executing Queries

Use concrete executors for execution. By default, a concrete executor uses the
built-in renderer and the ambient `effect/unstable/sql` `SqlClient` service.

```ts
import { Column, Query, Table } from "effect-qb"
import * as Pg from "effect-qb/postgres"

const users = Table.make("users", {
  id: Column.uuid().pipe(Column.primaryKey),
  email: Column.text()
})

const readUsers = Query.select({
  id: users.id,
  email: users.email
}).pipe(Query.from(users))

const rowsEffect = Pg.Executor.make().execute(readUsers)
const rowStream = Pg.Executor.make().stream(readUsers)

```

Executors also accept custom renderers, custom drivers, driver modes, and value
mappings.

<details>
<summary>Custom driver shape</summary>

```ts
import * as Effect from "effect/Effect"
import * as Stream from "effect/Stream"
import * as Pg from "effect-qb/postgres"

const driver = Pg.Executor.driver({
  execute: () => Effect.succeed([]),
  stream: () => Stream.empty
})

const executor = Pg.Executor.make({ driver })

```

</details>

## Dialects

### Portable Standard Surface

Portable APIs are exported from `effect-qb`; dialect modules add only concrete
behavior. Any plan built entirely from root modules renders through every
dialect renderer — see [Quick Start](#quick-start) for one plan rendered as
Postgres, MySQL, and SQLite.

Dialect modules expose:

| Module | Adds |
| --- | --- |
| `effect-qb/postgres` | Postgres column extensions, option modifiers, Postgres-only JSON/jsonb helpers, Postgres-only type witnesses for casts/references, schemas, enums, sequences, renderer, executor |
| `effect-qb/mysql` | MySQL column extensions, MySQL-only JSON helpers, MySQL-only type witnesses, renderer, executor |
| `effect-qb/sqlite` | SQLite column extensions, SQLite-only JSON helpers, SQLite-only type witnesses, renderer, executor |

Portable columns and tables are created from `effect-qb`, not from dialect
modules. For example, use `Column.uuid()`, not `Pg.Column.uuid()`.

### Postgres

Postgres adds `jsonb`, arrays, identity columns, richer index metadata, custom
type witnesses, schemas, enums, and sequences.

#### jsonb and Table Extensions

```ts
import * as Schema from "effect/Schema"
import { Column, Index, Query, Table } from "effect-qb"
import { Jsonb } from "effect-qb/postgres"
import * as Pg from "effect-qb/postgres"

const payloadSchema = Schema.Struct({
  kind: Schema.String,
  actorId: Schema.String
})

const events = Table.make("events", {
  id: Column.uuid().pipe(Column.primaryKey),
  payload: Pg.Column.jsonb(payloadSchema),
  createdAt: Column.datetime()
}).pipe(
  Index.make((table) => table.createdAt).pipe(
    Index.named("events_created_at_idx"),
    Pg.Index.using("btree")
  )
)

const createdEvents = Query.select({
  id: events.id,
  kind: events.payload.kind.pipe(Jsonb.text)
}).pipe(
  Query.from(events),
  Query.where(Query.eq(events.payload.kind.pipe(Jsonb.text), "created"))
)

const rendered = Pg.Renderer.make().render(createdEvents)
// select "events"."id" as "id", ("events"."payload" ->> $1) as "kind" from "events" where (("events"."payload" ->> $2) = $3)
```

#### Schemas, Enums, and Sequences

<details>
<summary>Example</summary>

```ts
import { Casing, Column } from "effect-qb"
import * as Pg from "effect-qb/postgres"

const Analytics = Pg.Schema.make("analytics").pipe(
  Casing.withCasing({
    tables: "snake_case",
    columns: "snake_case",
    types: "snake_case",
    sequences: "snake_case"
  })
)

const status = Analytics.enum("EventStatus", ["pending", "processed"] as const)
const sequence = Analytics.sequence("EventIdSeq")

const metrics = Analytics.table("Metrics", {
  id: Column.uuid().pipe(Column.primaryKey),
  status: status.column(),
  sequenceValue: Pg.Column.int8().pipe(
    Column.default(Pg.Function.nextVal(sequence))
  )
})

```

</details>

### MySQL

MySQL plans use the root APIs for portable tables and columns, plus MySQL
helpers when the query depends on MySQL-specific SQL.

```ts
import * as Schema from "effect/Schema"
import { Column, Json, Query, Table } from "effect-qb"
import * as My from "effect-qb/mysql"

const docs = Table.make("docs", {
  id: Column.uuid().pipe(Column.primaryKey),
  payload: Column.json(Schema.Struct({
    title: Schema.String
  }))
})

const readDocs = Query.select({
  id: docs.id,
  title: docs.payload.title.pipe(Json.text)
}).pipe(Query.from(docs))

const rendered = My.Renderer.make().render(readDocs)
// select `docs`.`id` as `id`, json_unquote(json_extract(`docs`.`payload`, ?)) as `title` from `docs`
```

Use root `Json` for portable JSON access and construction. Reach for `My.Json`
only when the behavior is MySQL-specific, such as MySQL's `json_type` result
strings or unsupported-helper diagnostics. Property paths are the normal
schema-known path API; `Json.key(...)` is only needed for dynamic or
non-identifier keys.

MySQL renderer differences include backtick quoting, question-mark placeholders,
MySQL casts/functions where needed, and MySQL legality checks. MySQL does not
support every feature available in Postgres. For example, full joins and
`returning` projections on some mutations are rejected.

### SQLite

SQLite plans also use the root APIs for portable tables and columns, plus SQLite
helpers for SQLite-specific SQL such as JSON1 functions.

```ts
import * as Schema from "effect/Schema"
import { Column, Json, Query, Table } from "effect-qb"
import * as Sq from "effect-qb/sqlite"

const docs = Table.make("docs", {
  id: Column.text().pipe(Column.primaryKey),
  payload: Column.json(Schema.Struct({
    profile: Schema.Struct({
      city: Schema.String
    })
  }))
})

const readDocs = Query.select({
  id: docs.id,
  city: docs.payload.profile.city.pipe(Json.text)
}).pipe(Query.from(docs))

const rendered = Sq.Renderer.make().render(readDocs)
// select "docs"."id" as "id", json_extract("docs"."payload", ?) as "city" from "docs"
```

Use root `Json` for portable JSON access and construction. Reach for `Sq.Json`
only when the behavior is SQLite-specific, such as JSON1 insert restrictions or
SQLite's `json_type` result strings. Property paths are the normal schema-known
path API; `Json.key(...)` is only needed for dynamic or non-identifier keys.

SQLite support includes DDL, mutations, reads, streams, transactions/savepoints,
and JSON1 helpers. Some SQL features remain intentionally unsupported where
SQLite has no equivalent.

## Recipes

These combine features covered above into snippets you can copy whole.

<details open>
<summary>Paginated, filtered, ordered read</summary>

```ts
import { Column, Query, Table } from "effect-qb"
import * as Pg from "effect-qb/postgres"

const users = Table.make("users", {
  id: Column.uuid().pipe(Column.primaryKey),
  email: Column.text(),
  displayName: Column.text(),
  active: Column.boolean()
})

const page = Query.select({
  id: users.id,
  email: users.email,
  displayName: users.displayName
}).pipe(
  Query.from(users),
  Query.where(Query.eq(users.active, true)),
  Query.orderBy(users.email),
  Query.limit(20),
  Query.offset(40)
)

const rendered = Pg.Renderer.make().render(page)
// select "users"."id" as "id", "users"."email" as "email", "users"."displayName" as "displayName" from "users" where ("users"."active" = $1) order by "users"."email" asc limit $2 offset $3
```

</details>

<details>
<summary>Postgres upsert returning the affected row</summary>

```ts
import { Column, Query, Table } from "effect-qb"
import * as Pg from "effect-qb/postgres"

const users = Table.make("users", {
  id: Column.uuid().pipe(Column.primaryKey),
  email: Column.text().pipe(Column.unique),
  displayName: Column.text()
})

const upserted = Query.upsert(
  users,
  { id: "user-id", email: "ada@example.com", displayName: "Ada" },
  "email",
  { displayName: "Ada Lovelace" }
).pipe(
  Query.returning({ id: users.id, email: users.email })
)

// returning(...) is rendered/executed by a dialect that supports it.
const rendered = Pg.Renderer.make().render(upserted)
```

</details>

<details>
<summary>CamelCase models against snake_case database names</summary>

```ts
import { Casing, Column, Query, Table } from "effect-qb"
import * as Pg from "effect-qb/postgres"

const users = Table.make("Users", {
  id: Column.uuid().pipe(Column.primaryKey),
  emailAddress: Column.text(),
  createdAt: Column.datetime()
}).pipe(
  Casing.withCasing({
    tables: "snake_case",
    columns: "snake_case"
  })
)

const recent = Query.select({
  id: users.id,
  emailAddress: users.emailAddress
}).pipe(
  Query.from(users),
  Query.orderBy(users.createdAt)
)

// Model keys stay camelCase; physical identifiers render as snake_case.
const rendered = Pg.Renderer.make().render(recent)
// select "users"."id" as "id", "users"."email_address" as "emailAddress" from "users" order by "users"."created_at" asc
```

</details>

## Guarantees and Boundaries

### Limitations

- Standard plans are portable only while they stay on the root API surface.
- Dialect-specific helpers narrow plans to that dialect.
- MySQL and SQLite do not have Postgres-style schema namespaces, enums, or
  sequences.
- MySQL does not support every mutation `returning` shape.
- SQLite has type-affinity and SQL feature limits that differ from server
  databases.
- `effect-qb` is not a migration CLI. See `effect-db` for that companion
  workflow.

### Companion Package: effect-db

`effect-db` lives in this workspace but is a separate package. It handles the
schema-management workflow around database pull, push, and migrations. Keep the
mental model separate:

- `effect-qb` defines tables and query plans.
- `effect-qb` renders and executes typed SQL.
- `effect-db` is the companion package for schema-management CLI workflows.

## Reference

### API Map

Root modules:

| Module | Purpose |
| --- | --- |
| `Column` | portable column definitions and modifiers |
| `Table` | portable table definitions, aliases, derived schemas |
| `PrimaryKey`, `Unique`, `Index`, `ForeignKey`, `Check` | portable table-level options |
| `Query` | portable query construction DSL |
| `Function` | portable SQL function expressions |
| `Renderer` | standard renderer |
| `Datatypes` | portable datatype witnesses |
| `Casing` | composable physical identifier casing |

Concrete modules:

| Module | Purpose |
| --- | --- |
| `effect-qb/postgres` | Postgres-specific columns, option modifiers, query helpers, Postgres-only JSON/jsonb, Postgres-only type witnesses, schemas, renderer, executor |
| `effect-qb/mysql` | MySQL-specific helpers, MySQL-only JSON helpers, MySQL-only type witnesses, renderer, executor |
| `effect-qb/sqlite` | SQLite-specific helpers, SQLite-only JSON helpers, SQLite-only type witnesses, renderer, executor |
| `effect-qb/postgres/metadata` | Postgres metadata normalization helpers |

### Development

```sh
bun install
bun run build
bun test
bun run test:types
bun run test:integration
bun run test:pack
```

This repository uses Bun and `tsgo`. Do not add `tsc`-based scripts or docs
unless there is a specific reason.

The main test areas are:

- `test/public/behavior`
- `test/internal/behavior`
- `test/public/types`
- `test/internal/types`
- public integration tests for concrete executors

For README edits that add TypeScript snippets, run:

```sh
bun run generate:readme-types
bunx tsgo -p tsconfig.type-tests.json
```
