# effect-qb

Typed SQL query building for Effect-oriented TypeScript applications.

`effect-qb` lets you define tables once, compose typed query plans, render those
plans for a concrete SQL dialect, and execute them through Effect SQL clients or a
custom driver. It is a query builder, not an ORM: table definitions describe SQL
shape and runtime schemas, while query plans stay explicit and inspectable.

The default import path is portable:

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

const rendered = Pg.Renderer.make().render(activeUsers)

```

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
  - [Result Rows and Predicate Facts](#result-rows-and-predicate-facts)
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
bun add effect-qb effect @effect/sql @effect/experimental
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

Define a table, build a query, render it for a dialect, and derive the result
row type from the plan.

```ts
import { Column, Function, Query, Table } from "effect-qb"
import * as Pg from "effect-qb/postgres"

const users = Table.make("users", {
  id: Column.uuid().pipe(Column.primaryKey),
  email: Column.text(),
  displayName: Column.text(),
  bio: Column.text().pipe(Column.nullable)
})

const userDirectory = Query.select({
  id: users.id,
  email: Function.lower(users.email),
  displayName: users.displayName
}).pipe(
  Query.from(users),
  Query.where(Query.isNotNull(users.bio)),
  Query.orderBy(users.email)
)

type UserDirectoryRow = Query.ResultRow<typeof userDirectory>
// {
//   readonly id: string
//   readonly email: string
//   readonly displayName: string
// }

const rendered = Pg.Renderer.make().render(userDirectory)
// rendered.sql:
// select "users"."id" as "id", lower("users"."email") as "email", "users"."displayName" as "displayName" from "users" where ("users"."bio" is not null) order by "users"."email" asc

```

The query plan above is portable because it only uses root modules. It can be
rendered by any built-in renderer.

```ts
import { Column, Query, Table } from "effect-qb"
import * as My from "effect-qb/mysql"
import * as Pg from "effect-qb/postgres"
import * as Sq from "effect-qb/sqlite"

const accounts = Table.make("accounts", {
  id: Column.uuid().pipe(Column.primaryKey),
  email: Column.text()
})

const readAccounts = Query.select({
  id: accounts.id,
  email: accounts.email
}).pipe(Query.from(accounts))

const postgres = Pg.Renderer.make().render(readAccounts)
// postgres.sql:
// select "accounts"."id" as "id", "accounts"."email" as "email" from "accounts"

const mysql = My.Renderer.make().render(readAccounts)
// mysql.sql:
// select `accounts`.`id` as `id`, `accounts`.`email` as `email` from `accounts`

const sqlite = Sq.Renderer.make().render(readAccounts)
// sqlite.sql:
// select "accounts"."id" as "id", "accounts"."email" as "email" from "accounts"
```

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
  ForeignKey.make((table) => table.orgId, () => organizations.id),
  PrimaryKey.make((table) => [table.orgId, table.userId]),
  Unique.make((table) => [table.orgId, table.role]),
  Check.make(
    "memberships_role_check",
    (table) => Query.neq(table.role, "")
  ),
  Index.make((table) => table.userId)
)

type Organization = Table.SelectOf<typeof organizations>
type NewOrganization = Table.InsertOf<typeof organizations>
type OrganizationPatch = Table.UpdateOf<typeof organizations>

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
- `int`, `bigint`, `number`, `decimal`, `real`
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

### Table Shape and Payloads

Table definitions derive select, insert, and update payloads from column
metadata. Generated columns are omitted from inserts, nullable/default columns
become optional for inserts, and primary keys are omitted from updates.

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

type UserInsert = Table.InsertOf<typeof users>
// {
//   readonly email: string
//   readonly displayName?: string | null
// }

type UserUpdate = Table.UpdateOf<typeof users>
// {
//   readonly email?: string
//   readonly displayName?: string | null
// }

const insertWithId: UserInsert = {
  // @ts-expect-error generated primary keys are not insert payload fields
  id: "550e8400-e29b-41d4-a716-446655440000",
  email: "ada@example.com"
}

const updateWithId: UserUpdate = {
  // @ts-expect-error primary keys are not update payload fields
  id: "550e8400-e29b-41d4-a716-446655440000"
}

const selectSchema = Table.selectSchema(users)
const insertSchema = Table.insertSchema(users)
const updateSchema = Table.updateSchema(users)
const parsedInsert = Schema.decodeUnknownSync(insertSchema)({
  email: "ada@example.com"
})
const parsedUpdate = Schema.decodeUnknownSync(updateSchema)({
  displayName: null
})

type UserSelectFromSchema = Schema.Schema.Type<typeof selectSchema>
type UserInsertFromSchema = Schema.Schema.Type<typeof insertSchema>
type UserUpdateFromSchema = Schema.Schema.Type<typeof updateSchema>

```

The same metadata powers `table.schemas.select`, `table.schemas.insert`, and
`table.schemas.update`, so Effect Schema validation and TypeScript payload
types stay aligned.

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
  status: Column.text()
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
import { Column, Query, Table } from "effect-qb"
import { Jsonb } from "effect-qb/postgres"
import * as Pg from "effect-qb/postgres"

const payloadSchema = Schema.Union(
  Schema.Struct({
    kind: Schema.Literal("created"),
    actorId: Schema.String
  }),
  Schema.Struct({
    kind: Schema.Literal("deleted"),
    reason: Schema.String
  })
)

const events = Table.make("events", {
  id: Column.uuid().pipe(Column.primaryKey),
  payload: Pg.Column.jsonb(payloadSchema)
})

const kind = events.payload.kind.pipe(Jsonb.text)

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

### JSON Schema Compatibility

JSON columns carry their Effect Schema type through JSON helper expressions.
Mutation payloads must still satisfy the target column schema, so deleting a
required key is rejected before SQL rendering.

```ts
import * as Schema from "effect/Schema"
import { Column, Query, Table } from "effect-qb"
import { Jsonb } from "effect-qb/postgres"
import * as Pg from "effect-qb/postgres"

const payloadSchema = Schema.Struct({
  profile: Schema.Struct({
    address: Schema.Struct({
      city: Schema.String,
      postcode: Schema.NullOr(Schema.String)
    }),
    tags: Schema.Array(Schema.String),
    legacyName: Schema.optional(Schema.String),
    legacySlug: Schema.optional(Schema.String)
  }),
  note: Schema.NullOr(Schema.String)
})

const docs = Table.make("docs", {
  id: Column.uuid().pipe(Column.primaryKey),
  payload: Pg.Column.jsonb(payloadSchema)
})

const missingRequiredCity = docs.payload.profile.address.city.pipe(Jsonb.delete)

Query.update(docs, {
  // @ts-expect-error payload no longer satisfies payloadSchema
  payload: missingRequiredCity
})
```

Deleting multiple paths is a sequence of terminal deletes. After each delete,
start the next path from the updated JSON value.

```ts
const withoutLegacyFields = docs.payload.pipe(
  (payload) => payload.profile.legacyName.pipe(Jsonb.delete),
  (payload) => payload.profile.legacySlug.pipe(Jsonb.delete)
)
```

Use the same property-path shape with root `Json.delete` for portable
`Column.json(...)` values. Keep `Json.key(...)` / `Jsonb.key(...)` for dynamic,
invalid-identifier, or reserved JSON keys.

### Source Completeness and Aliases

Plans know which sources they reference. Incomplete plans are still composable,
but rendering, execution, CTEs, and derived sources require complete plans. SQL
aliases also have to be literal, non-empty strings so result paths and source
identity stay stable.

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

declare const dynamicAlias: string

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

Pg.Renderer.make().render(portable)
My.Renderer.make().render(portable)
Sq.Renderer.make().render(portable)

const docs = Table.make("docs", {
  id: Column.uuid().pipe(Column.primaryKey),
  payload: Pg.Column.jsonb(Schema.Struct({
    kind: Schema.String
  }))
})

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
  title: Column.text(),
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

const mapping: Scalar.DriverValueMapping = {
  fromDriver: (value) => value,
  toDriver: (value) => value,
  selectSql: (sql) => sql,
  jsonSelectSql: (sql) => sql
}

const renderer = Pg.Renderer.make({
  valueMappings: {
    text: mapping,
    jsonb: mapping,
    string: mapping
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
built-in renderer and the ambient `@effect/sql` `SqlClient` service.

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

Portable APIs are exported from `effect-qb`. Dialect modules add only concrete
behavior.

```ts
import { Column, Query, Table } from "effect-qb"
import * as My from "effect-qb/mysql"
import * as Pg from "effect-qb/postgres"
import * as Sq from "effect-qb/sqlite"

const users = Table.make("users", {
  id: Column.uuid().pipe(Column.primaryKey),
  email: Column.text()
})

const plan = Query.select({
  id: users.id,
  email: users.email
}).pipe(Query.from(users))

Pg.Renderer.make().render(plan)
My.Renderer.make().render(plan)
Sq.Renderer.make().render(plan)
```

Dialect modules expose:

| Module | Adds |
| --- | --- |
| `effect-qb/postgres` | Postgres column extensions, option modifiers, Postgres-only JSON/jsonb helpers, type witnesses for casts/references, schemas, enums, sequences, renderer, executor |
| `effect-qb/mysql` | MySQL column extensions, MySQL-only JSON helpers, renderer, executor |
| `effect-qb/sqlite` | SQLite column extensions, SQLite-only JSON helpers, renderer, executor |

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

const payloadSchema = Schema.Union(
  Schema.Struct({
    kind: Schema.Literal("created"),
    actorId: Schema.String
  }),
  Schema.Struct({
    kind: Schema.Literal("deleted"),
    reason: Schema.String
  })
)

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

const eventKinds = Query.select({
  id: events.id,
  kind: events.payload.kind.pipe(Jsonb.text)
}).pipe(Query.from(events))

Pg.Renderer.make().render(eventKinds)
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

My.Renderer.make().render(readDocs)
```

Use root `Json` for portable JSON access and construction. Reach for `My.Json`
only when the behavior is MySQL-specific, such as MySQL's `json_type` result
strings or unsupported-helper diagnostics.

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

Sq.Renderer.make().render(readDocs)
```

Use root `Json` for portable JSON access and construction. Reach for `Sq.Json`
only when the behavior is SQLite-specific, such as JSON1 insert restrictions or
SQLite's `json_type` result strings.

SQLite support includes DDL, mutations, reads, streams, transactions/savepoints,
and JSON1 helpers. Some SQL features remain intentionally unsupported where
SQLite has no equivalent.

## Recipes

<details open>
<summary>Portable read query</summary>

```ts
import { Column, Function, Query, Table } from "effect-qb"

const users = Table.make("users", {
  id: Column.uuid().pipe(Column.primaryKey),
  email: Column.text()
})

const plan = Query.select({
  id: users.id,
  email: Function.lower(users.email)
}).pipe(Query.from(users))

type Row = Query.ResultRow<typeof plan>
// {
//   readonly id: string
//   readonly email: string
// }

```

</details>

<details>
<summary>CamelCase models against snake_case database names</summary>

```ts
import { Casing, Column, Table } from "effect-qb"

const users = Table.make("Users", {
  id: Column.uuid().pipe(Column.primaryKey),
  createdAt: Column.datetime()
}).pipe(
  Casing.withCasing({
    tables: "snake_case",
    columns: "snake_case"
  })
)

```

</details>

<details>
<summary>Postgres jsonb path read</summary>

```ts
import * as Schema from "effect/Schema"
import { Column, Query, Table } from "effect-qb"
import { Jsonb } from "effect-qb/postgres"
import * as Pg from "effect-qb/postgres"

const docs = Table.make("docs", {
  id: Column.uuid().pipe(Column.primaryKey),
  payload: Pg.Column.jsonb(Schema.Struct({
    profile: Schema.Struct({
      address: Schema.Struct({
        city: Schema.String
      })
    })
  }))
})

const city = docs.payload.profile.address.city.pipe(Jsonb.text)

const plan = Query.select({ city }).pipe(Query.from(docs))

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
| `effect-qb/postgres` | Postgres-specific columns, option modifiers, query helpers, Postgres-only JSON/jsonb, schemas, renderer, executor |
| `effect-qb/mysql` | MySQL-specific helpers, MySQL-only JSON helpers, renderer, executor |
| `effect-qb/sqlite` | SQLite-specific helpers, SQLite-only JSON helpers, renderer, executor |
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
