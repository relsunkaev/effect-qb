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

void rendered
type _ActiveUser = ActiveUser
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
  - [Type Safety](#type-safety)
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

- `effect-qb` - portable table, column, query, function, renderer, and casing modules
- `effect-qb/standard` - explicit portable subpath
- `effect-qb/postgres` - Postgres extensions, renderer, executor, schema helpers
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

const postgresSql = Pg.Renderer.make().render(userDirectory)

void postgresSql
type _UserDirectoryRow = UserDirectoryRow
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

Pg.Renderer.make().render(readAccounts)
My.Renderer.make().render(readAccounts)
Sq.Renderer.make().render(readAccounts)
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

If a plan uses `Pg.Column.jsonb(...)`, `Pg.Json.jsonb.*`, `Pg.Table.index(...)`,
or another Postgres-specific helper, it becomes a Postgres plan. Render and
execute that plan with the Postgres renderer or executor.

MySQL and SQLite follow the same rule: use root modules for portable SQL, and
concrete modules only when the query depends on concrete SQL.

</details>

### Defining Tables

`Table.make` is the primary table factory.

```ts
import { Column, Table } from "effect-qb"

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
  Table.primaryKey(["orgId", "userId"] as const),
  Table.index("userId")
)

type Organization = Table.SelectOf<typeof organizations>
type NewOrganization = Table.InsertOf<typeof organizations>
type OrganizationPatch = Table.UpdateOf<typeof organizations>

void memberships
type _Organization = Organization
type _NewOrganization = NewOrganization
type _OrganizationPatch = OrganizationPatch
```

Root table helpers cover portable constraints and metadata:

- `Table.primaryKey(...)`
- `Table.unique(...)`
- `Table.index(...)`
- `Table.foreignKey(...)`
- `Table.check(...)`
- `Table.alias(...)`
- `Table.selectSchema(...)`, `Table.insertSchema(...)`, `Table.updateSchema(...)`

<details>
<summary>Class-style tables</summary>

`Table.Class` exists for class-style declarations and advanced schema-centric
workflows. Prefer `Table.make` unless your codebase already uses class-style
table definitions.

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

type _EventRow = EventRow
type _EventInsert = EventInsert
```

Postgres adds concrete types such as `jsonb`, `bytea`, arrays, identity
columns, timestamp variants, and custom typed casts/references.

### Casing and Naming

Use `Casing` when model identifiers and physical database identifiers do not
use the same naming convention.

Casing can be configured at the renderer level, or attached to tables and
Postgres schema factories.

```ts
import * as Schema from "effect/Schema"
import { Casing, Column, Query, Table } from "effect-qb"
import * as Pg from "effect-qb/postgres"

const Snake = Casing.casing({
  tables: "snake_case",
  columns: "snake_case"
})

const users = Snake.table("Users", {
  id: Column.uuid().pipe(Column.primaryKey),
  createdAt: Column.datetime()
})

const Analytics = Pg.Schema.make("analytics").pipe(
  Casing.withCasing({
    tables: "snake_case",
    columns: "snake_case",
    types: "snake_case",
    sequences: "snake_case"
  })
)

const events = Table.make("Events", {
  id: Column.uuid().pipe(Column.primaryKey),
  createdAt: Column.datetime(),
  meta: Pg.Column.jsonb(Schema.Struct({
    kind: Schema.String
  }))
}).pipe(
  Casing.withCasing({ columns: "snake_case" }),
  Analytics.withSchema
)

const readEvents = Query.select({
  id: events.id,
  kind: Pg.Json.jsonb.text(events.meta, Pg.Json.jsonb.key("kind"))
}).pipe(Query.from(events))

Pg.Renderer.make().render(readEvents)

void users
```

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

type _PostsByUserRow = PostsByUserRow
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

void insertUser
void incrementVisits
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

const rendered = Pg.Renderer.make({
  casing: {
    tables: "snake_case",
    columns: "snake_case"
  }
}).render(readUsers)

const sql: string = rendered.sql
const params: readonly unknown[] = rendered.params

void sql
void params
```

Renderer options:

- `casing?` - renderer-level physical identifier casing
- `valueMappings?` - typed driver-boundary mappings by known datatype or datatype family

`valueMappings` is keyed by the renderer's known type surface. Unknown keys are
type errors.

```ts
import * as Pg from "effect-qb/postgres"

const mapping: Pg.Scalar.DriverValueMapping = {
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

void renderer
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

void rowsEffect
void rowStream
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

void executor
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
| `effect-qb/postgres` | Postgres column/table extensions, JSON/jsonb helpers, casts, types, schemas, enums, sequences, renderer, executor |
| `effect-qb/mysql` | MySQL column extensions, JSON helpers, functions, renderer, executor |
| `effect-qb/sqlite` | SQLite column extensions, JSON helpers, functions, renderer, executor |

Portable columns and tables are created from `effect-qb`, not from dialect
modules. For example, use `Column.uuid()`, not `Pg.Column.uuid()`.

### Postgres

Postgres adds `jsonb`, arrays, identity columns, richer index metadata, casts,
custom types, schemas, enums, and sequences.

#### jsonb and Table Extensions

```ts
import * as Schema from "effect/Schema"
import { Column, Query, Table } from "effect-qb"
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
  Pg.Table.index({
    name: "events_created_at_idx",
    columns: "createdAt",
    method: "btree"
  })
)

const eventKinds = Query.select({
  id: events.id,
  kind: Pg.Json.jsonb.text(events.payload, Pg.Json.jsonb.key("kind"))
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

void metrics
```

</details>

### MySQL

MySQL plans use the root APIs for portable tables and columns, plus MySQL
helpers when the query depends on MySQL-specific SQL.

```ts
import * as Schema from "effect/Schema"
import { Column, Query, Table } from "effect-qb"
import * as My from "effect-qb/mysql"

const docs = Table.make("docs", {
  id: Column.uuid().pipe(Column.primaryKey),
  payload: Column.json(Schema.Struct({
    title: Schema.String
  }))
})

const readDocs = Query.select({
  id: docs.id,
  title: My.Json.json.text(docs.payload, My.Json.json.key("title"))
}).pipe(Query.from(docs))

My.Renderer.make().render(readDocs)
```

MySQL renderer differences include backtick quoting, question-mark placeholders,
MySQL casts/functions where needed, and MySQL legality checks. MySQL does not
support every feature available in Postgres. For example, full joins and
`returning` projections on some mutations are rejected.

### SQLite

SQLite plans also use the root APIs for portable tables and columns, plus SQLite
helpers for SQLite-specific SQL such as JSON1 functions.

```ts
import * as Schema from "effect/Schema"
import { Column, Query, Table } from "effect-qb"
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
  city: Sq.Json.json.text(
    docs.payload,
    Sq.Json.json.path(Sq.Json.json.key("profile"), Sq.Json.json.key("city"))
  )
}).pipe(Query.from(docs))

Sq.Renderer.make().render(readDocs)
```

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

type _Row = Row
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

void users
```

</details>

<details>
<summary>Postgres jsonb path read</summary>

```ts
import * as Schema from "effect/Schema"
import { Column, Query, Table } from "effect-qb"
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

const city = Pg.Json.jsonb.text(
  docs.payload,
  Pg.Json.jsonb.path(
    Pg.Json.jsonb.key("profile"),
    Pg.Json.jsonb.key("address"),
    Pg.Json.jsonb.key("city")
  )
)

const plan = Query.select({ city }).pipe(Query.from(docs))

void plan
```

</details>

## Guarantees and Boundaries

### Type Safety

`effect-qb` pushes validation into the type system wherever the public API can
know the answer statically:

- table names, schema names, column names, and aliases are literal-aware
- empty table names, empty field maps, and empty alias strings are rejected
- selected result rows are inferred from the query plan
- insert/update inputs are inferred from table metadata
- concrete dialect conflicts are rejected
- renderer and executor `valueMappings` accept only known keys
- many table option conflicts are rejected before runtime

Runtime checks remain at the boundaries where real data enters or leaves the
typed plan: rendering, driver execution, and row decoding.

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
| `Table` | portable table definitions, aliases, constraints, derived schemas |
| `Query` | portable query construction DSL |
| `Function` | portable SQL function expressions |
| `Renderer` | standard renderer |
| `Datatypes` | portable datatype witnesses |
| `Casing` | composable physical identifier casing |

Concrete modules:

| Module | Purpose |
| --- | --- |
| `effect-qb/postgres` | Postgres-specific columns, table options, query helpers, JSON/jsonb, schemas, renderer, executor |
| `effect-qb/mysql` | MySQL-specific helpers, renderer, executor |
| `effect-qb/sqlite` | SQLite-specific helpers, renderer, executor |
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
