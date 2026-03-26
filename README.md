# effect-qb

Type-safe SQL query construction for PostgreSQL and MySQL, with query plans that carry result shapes, nullability, dialect compatibility, and statement constraints in the type system.

## Overview

`effect-qb` builds immutable query plans and pushes the interesting parts of SQL into the type system:

- exact projection shapes
- implication-aware nullability and joined-source presence/absence
- predicate-driven narrowing
- join optionality
- aggregate and grouping validation
- dialect compatibility
- statement and execution result types

The main contract is compile-time. `Query.ResultRow<typeof plan>` is the logical row type after implication analysis, while `Query.RuntimeResultRow<typeof plan>` describes the runtime remap shape. At runtime, the library renders SQL, executes it, normalizes raw driver values, applies schema-backed transforms where they exist, and uses the same proof facts to narrow selected expressions and joined tables.

## Why effect-qb

Use `effect-qb` when you want SQL plans to carry more than column names:

- exact nested projection shapes
- nullability refinement from predicates
- join optionality that changes with query structure
- grouped-query validation before SQL is rendered
- dialect-locked plans, renderers, and executor error channels

It is a query-construction library, not an ORM. It does not manage model identities or runtime row decoding.

## Installation

If you only want the typed DSL and SQL rendering:

```bash
bun add effect-qb
npm install effect-qb
```

If you want to execute plans with the built-in Postgres executor:

```bash
bun add effect-qb effect @effect/sql @effect/sql-pg
npm install effect-qb effect @effect/sql @effect/sql-pg
```

If you want to execute plans with the built-in MySQL executor:

```bash
bun add effect-qb effect @effect/sql @effect/sql-mysql2
npm install effect-qb effect @effect/sql @effect/sql-mysql2
```

The built-in executors require an ambient `@effect/sql` `SqlClient`. If your app already uses Effect and `@effect/sql`, you likely already have the extra runtime packages installed.

For local development in this repository:

```bash
bun install
```

## Table of Contents

- [Choose An Entrypoint](#choose-an-entrypoint)
- [Postgres Function](#postgres-function)
- [Quick Start](#quick-start)
- [Execution Model](#execution-model)
- [Feature Map](#feature-map)
- [Effect Schema Integration](#effect-schema-integration)
- [Core Concepts](#core-concepts)
  - [Derived Table Schemas](#derived-table-schemas)
  - [Tables And Columns](#tables-and-columns)
  - [Plans, Not Strings](#plans-not-strings)
  - [ResultRow vs RuntimeResultRow](#resultrow-vs-runtimeresultrow)
  - [Schema-backed JSON Columns](#schema-backed-json-columns)
  - [Dialect-specific Entrypoints](#dialect-specific-entrypoints)
- [Query Guide](#query-guide)
  - [Selecting Data](#selecting-data)
  - [Bringing Sources Into Scope](#bringing-sources-into-scope)
  - [Filtering Rows](#filtering-rows)
  - [Shaping Results](#shaping-results)
  - [Aggregating](#aggregating)
  - [Combining Queries](#combining-queries)
  - [Controlling Result Sets](#controlling-result-sets)
- [Mutations](#mutations)
  - [Insert](#insert)
  - [Update](#update)
  - [Delete](#delete)
  - [Conflicts And Upserts](#conflicts-and-upserts)
  - [Returning](#returning)
  - [Data-modifying CTEs](#data-modifying-ctes)
- [Rendering And Execution](#rendering-and-execution)
  - [Renderer](#renderer)
  - [Executor](#executor)
  - [Query-sensitive Error Channels](#query-sensitive-error-channels)
  - [Transaction Helpers](#transaction-helpers)
- [Error Handling](#error-handling)
  - [Catalogs And Normalization](#catalogs-and-normalization)
  - [Query-capability Narrowing](#query-capability-narrowing)
  - [Matching Errors In Application Code](#matching-errors-in-application-code)
- [Type Safety](#type-safety)
  - [Complete-plan Enforcement](#complete-plan-enforcement)
  - [Predicate-driven Narrowing](#predicate-driven-narrowing)
  - [Join Optionality](#join-optionality)
  - [Grouped Query Validation](#grouped-query-validation)
  - [Dialect Compatibility](#dialect-compatibility)
  - [JSON Schema Compatibility In Mutations](#json-schema-compatibility-in-mutations)
  - [Readable Branded Type Errors](#readable-branded-type-errors)
- [Dialect Support](#dialect-support)
  - [PostgreSQL](#postgresql)
  - [MySQL](#mysql)
- [Limitations](#limitations)
- [Contributing](#contributing)

## Choose An Entrypoint

Available entrypoints:

- `effect-qb/postgres`
- `effect-qb/mysql`

Use `effect-qb/postgres` when you want explicit Postgres branding throughout the plan, renderer, executor, datatypes, and errors.

That entrypoint also exposes `Postgres.Function` for typed SQL functions and JSON helpers.

Use `effect-qb/mysql` when you want the MySQL-specific DSL, renderer, executor, datatypes, and errors. It also exposes `Mysql.Function` for typed SQL functions and JSON helpers.

## Postgres Function

`effect-qb/postgres` exposes `Postgres.Function` for typed SQL expressions. The helpers are expressions, so they compose like other query values and keep their result types.

```ts
import { Column as C, Function as F, Query as Q, Table } from "effect-qb/postgres"

const users = Table.make("users", {
  id: C.uuid().pipe(C.primaryKey),
  email: C.text(),
  bio: C.text().pipe(C.nullable)
})

const userSummary = Q.select({
  email: F.lower(users.email),
  bio: F.coalesce(users.bio, "anonymous"),
  seenAt: F.currentTimestamp()
}).pipe(
  Q.from(users)
)
```

`Postgres.Function` currently covers:

- scalar helpers like `coalesce`, `lower`, `upper`, and `concat`
- aggregate helpers like `count`, `max`, and `min`
- window helpers like `over`, `rowNumber`, `rank`, and `denseRank`
- temporal helpers like `now`, `currentDate`, `currentTime`, `currentTimestamp`, `localTime`, and `localTimestamp`
- JSON helpers via `Function.json`

## Quick Start

```ts
import { Column as C, Function as F, Query as Q, Renderer, Table } from "effect-qb/postgres"

const users = Table.make("users", {
  id: C.uuid().pipe(C.primaryKey),
  email: C.text()
})

const posts = Table.make("posts", {
  id: C.uuid().pipe(C.primaryKey),
  userId: C.uuid(),
  title: C.text().pipe(C.nullable)
})

const postsPerUser = Q.select({
  userId: users.id,
  email: users.email,
  postCount: F.count(posts.id)
}).pipe(
  Q.from(users),
  Q.leftJoin(posts, Q.eq(users.id, posts.userId)),
  Q.groupBy(users.id, users.email),
  Q.orderBy(users.email)
)

type PostsPerUserRow = Q.ResultRow<typeof postsPerUser>
// {
//   userId: string
//   email: string
//   postCount: number
// }

const rendered = Renderer.make().render(postsPerUser)
rendered.sql
rendered.params
```

This is the core model: define typed tables, build a plan, let the plan define the row type, then render or execute it.

## Execution Model

The runtime model is intentionally small:

1. build a typed plan
2. render SQL plus bind params
3. normalize raw driver values into canonical `effect-qb` runtime values
4. apply propagated runtime schemas where they exist
5. remap flat aliases like `profile__email` back into nested objects

For the logical/static row split, see `ResultRow vs RuntimeResultRow` below.

```ts
import * as SqlClient from "@effect/sql/SqlClient"
import * as Effect from "effect/Effect"
import { Executor as PostgresExecutor } from "effect-qb/postgres"

const executor = PostgresExecutor.make()

const rowsEffect = executor.execute(postsPerUser)

const rows = Effect.runSync(
  Effect.provideService(rowsEffect, SqlClient.SqlClient, sqlClient)
)
```

Schema-backed columns and preserved projections can enforce runtime transforms during execution. Arbitrary query plans still do not become one big derived query schema automatically.

## Feature Map

The rest of this README goes deeper, but the main surface area is:

- table builders with keys, indexes, nullability, defaults, and schema-backed JSON columns
- select plans with joins, CTEs, derived tables, `values(...)`, `unnest(...)`, subqueries, and set operators
- mutation plans for `insert`, `update`, `delete`, `returning`, and conflict handling
- typed SQL functions via `Postgres.Function` and `Mysql.Function`
- renderers and executors for Postgres and MySQL
- type-level checks for missing sources, grouped selections, dialect compatibility, and JSON mutation compatibility

Dialect-specific capabilities are called out later. Postgres currently has the wider feature surface in a few areas such as `distinctOn(...)`, `generateSeries(...)`, and some JSON operators.

## Effect Schema Integration

`effect-qb` uses `effect/Schema` as the runtime contract for columns and tables.

That integration shows up in three places:

- column definitions carry runtime schemas
- tables derive `select`, `insert`, and `update` schemas from those columns
- built-in executors apply schema-backed transforms when selected projections carry a runtime schema

The schema-aware column APIs are:

- built-in columns like `C.uuid()`, `C.text()`, `C.number()`, `C.date()`, and `C.timestamp()`
- `C.schema(schema)` to replace a column's runtime schema without changing its SQL type or key/default metadata
- `C.custom(schema, dbType)` for arbitrary non-JSON columns
- `C.json(schema)` for JSON columns

### Defaults And Generated Columns

`C.default(expr)` and `C.generated(expr)` only affect write-shape:

- `C.default(expr)` keeps a column selectable and updatable, but optional on insert because the database may fill it
- `C.generated(expr)` omits a column from insert and update because the database owns the value
- both helpers keep the expression around for DDL rendering

The important rule for `C.schema(...)` is that the schema must accept the column's current runtime output, not the raw driver value.

- `C.date()` produces a canonical `LocalDateString`, so `C.date().pipe(C.schema(Schema.DateFromString))` is valid
- `C.int().pipe(C.schema(Schema.DateFromString))` is rejected because the column runtime type is `number`, not `string`

Example:

```ts
import * as Schema from "effect/Schema"
import { Column as C, Executor, Function as F, Query as Q, Table } from "effect-qb/postgres"

const users = Table.make("users", {
  id: C.uuid().pipe(C.primaryKey, C.generated(Q.literal("generated-user-id"))),
  happenedOn: C.date().pipe(C.schema(Schema.DateFromString)),
  profile: C.json(Schema.Struct({
    visits: Schema.NumberFromString
  })),
  createdAt: C.timestamp().pipe(C.default(F.localTimestamp()))
})

type UserSelect = Table.SelectOf<typeof users>
type UserInsert = Table.InsertOf<typeof users>
type UserUpdate = Table.UpdateOf<typeof users>

const decoded = Schema.decodeUnknownSync(users.schemas.select)({
  id: "11111111-1111-1111-1111-111111111111",
  happenedOn: "2026-03-20",
  profile: {
    visits: "42"
  },
  createdAt: "2026-03-20T10:00:00"
})

decoded.happenedOn
// Date

decoded.profile.visits
// number

const plan = Q.select({
  happenedOn: users.happenedOn,
  profile: users.profile
}).pipe(
  Q.from(users)
)

const rowsEffect = Executor.make().execute(plan)
```

From that one definition you get:

- bound SQL columns like `users.profile`
- derived table schemas: `users.schemas.select`, `users.schemas.insert`, `users.schemas.update`
- static helper types that line up with those schemas
- executor-side transforms for schema-backed projections

That last point matters. Built-in executors do not just remap aliases. They first normalize raw driver values into canonical `effect-qb` runtime values, then apply propagated schemas where they exist. So a selected `users.happenedOn` can become a `Date`, and a selected `users.profile` can decode `"42"` into `42` via `Schema.NumberFromString`.

The boundary is still important:

- table schemas are full `effect/Schema` values for table-shaped data
- schema-backed columns and preserved projections can enforce runtime transforms on reads
- arbitrary query plans do not automatically become one big derived query schema

## Core Concepts

### Derived Table Schemas

Every table exposes derived Effect Schemas:

```ts
import * as Schema from "effect/Schema"

const users = Table.make("users", {
  id: C.uuid().pipe(C.primaryKey, C.generated(Q.literal("generated-user-id"))),
  email: C.text().pipe(C.unique),
  bio: C.text().pipe(C.nullable),
  createdAt: C.timestamp().pipe(C.default(F.localTimestamp()))
})

Schema.isSchema(users.schemas.select)
Schema.isSchema(users.schemas.insert)
Schema.isSchema(users.schemas.update)
```

Those schemas are derived from column metadata, not maintained separately.

- `select` includes every column, with nullable columns wrapped in `Schema.NullOr(...)`
- `insert` omits generated columns and makes nullable/defaulted columns optional
- `update` omits generated columns and primary-key columns and makes the remaining columns optional

This is the main runtime bridge between the SQL DSL and Effect Schema. You can validate table payloads with the derived schemas without duplicating the model elsewhere.

### Tables And Columns

Tables are typed sources, not loose name strings. Columns carry DB types, nullability, defaults, keys, and schema-backed JSON information.

```ts
import * as Schema from "effect/Schema"
import { Column as C, Table, schema } from "effect-qb/postgres"

const users = Table.make("users", {
  id: C.uuid().pipe(C.primaryKey),
  email: C.text(),
  profile: C.json(Schema.Struct({
    displayName: Schema.String,
    bio: Schema.NullOr(Schema.String)
  }))
})
```

Schema-qualified tables are also typed:

```ts
const analytics = schema("analytics")

const events = analytics.table("events", {
  id: C.uuid().pipe(C.primaryKey),
  userId: C.uuid()
})
```

### Table Options

Table-level options live on the table definition itself. They are pipeable and render into DDL:

- `Table.primaryKey(...)` for table-level composite keys
- `Table.unique(...)` for table-level unique constraints
- `Table.index(...)` for table-level indexes
- `Table.foreignKey(...)` for table-level foreign keys
- `Table.check(...)` for expression-only check constraints

```ts
import { Column as C, Query as Q, Table } from "effect-qb/postgres"

const orgs = Table.make("orgs", {
  id: C.uuid().pipe(C.primaryKey),
  slug: C.text().pipe(C.unique)
})

const membershipsBase = Table.make("memberships", {
  id: C.uuid().pipe(C.primaryKey),
  orgId: C.uuid(),
  role: C.text(),
  note: C.text().pipe(C.nullable)
})

const memberships = membershipsBase.pipe(
  Table.foreignKey("orgId", () => orgs, "id"),
  Table.unique(["orgId", "role"] as const),
  Table.index(["role", "orgId"] as const),
  Table.check("role_not_empty", Q.neq(membershipsBase.role, Q.literal("")))
)
```

The `check` helper must receive an expression. Raw SQL strings are not accepted.

### Plans, Not Strings

`effect-qb` does not build rows from ad hoc string fragments. It builds typed plans. Partial plans are allowed while assembling a query, but rendering and execution require a complete plan.

That distinction is important:

- you can reference sources before they are in scope while composing
- the type system tracks what is still missing
- `render(...)`, `execute(...)`, and `Q.CompletePlan<typeof plan>` are the enforcement boundary

### ResultRow vs RuntimeResultRow

`Q.ResultRow<typeof plan>` is the logical result type after static implication analysis. It includes facts proven by:

- `where(...)` and `having(...)`
- join predicates
- `case()` branch pruning
- operators such as `eq(...)`, `gte(...)`, `in(...)`, `notIn(...)`, `isNull(...)`, and `isNotNull(...)`

`Q.RuntimeResultRow<typeof plan>` is the runtime remap shape. It is separate from the logical row type, but runtime execution still uses the same implication facts to validate impossible rows and collapse always-null projections where the proof is strong enough.

```ts
import { Column as C, Function as F, Query as Q, Table } from "effect-qb/postgres"

const posts = Table.make("posts", {
  id: C.uuid().pipe(C.primaryKey),
  userId: C.uuid(),
  title: C.text().pipe(C.nullable),
  status: C.text()
})

const draftOrPublishedPosts = Q.select({
  title: posts.title,
  upperTitle: F.upper(posts.title)
}).pipe(
  Q.from(posts),
  Q.where(Q.in(posts.title, "draft", "published"))
)

type LogicalRow = Q.ResultRow<typeof draftOrPublishedPosts>
// {
//   title: string
//   upperTitle: string
// }

type RuntimeRow = Q.RuntimeResultRow<typeof draftOrPublishedPosts>
// {
//   title: string | null
//   upperTitle: string | null
// }
```

### Schema-backed JSON Columns

JSON columns can carry a schema. That schema feeds:

- JSON path typing
- JSON manipulation result typing
- insert/update compatibility checks

```ts
import * as Schema from "effect/Schema"

const docs = Table.make("docs", {
  id: C.uuid().pipe(C.primaryKey),
  payload: C.json(Schema.Struct({
    profile: Schema.Struct({
      address: Schema.Struct({
        city: Schema.String,
        postcode: Schema.NullOr(Schema.String)
      })
    })
  }))
})

const cityPath = F.json.path(
  F.json.key("profile"),
  F.json.key("address"),
  F.json.key("city")
)

const city = F.json.get(docs.payload, cityPath)

type City = Q.ExpressionOutput<typeof city, {
  readonly docs: {
    readonly name: "docs"
    readonly mode: "required"
  }
}>
// string
```

### Dialect-specific Entrypoints

Dialect entrypoints expose dialect-specific builders:

```ts
import { Query as PostgresQuery } from "effect-qb/postgres"
import { Query as MysqlQuery } from "effect-qb/mysql"
```

This matters for:

- dialect-locked tables and columns
- dialect-only features like Postgres `distinctOn(...)`
- dialect-specific renderers and executors
- dialect-specific error unions

## Query Guide

### Selecting Data

Selections define the result type directly. Nested objects stay nested in the row type.

```ts
import { Column as C, Function as F, Query as Q, Table } from "effect-qb/postgres"

const users = Table.make("users", {
  id: C.uuid().pipe(C.primaryKey),
  email: C.text(),
  bio: C.text().pipe(C.nullable)
})

const posts = Table.make("posts", {
  id: C.uuid().pipe(C.primaryKey),
  userId: C.uuid(),
  title: C.text().pipe(C.nullable),
  status: C.text()
})

const comments = Table.make("comments", {
  id: C.uuid().pipe(C.primaryKey),
  postId: C.uuid(),
  body: C.text()
})

const listUsers = Q.select({
  id: users.id,
  profile: {
    email: users.email
  },
  hasPosts: Q.literal(true)
}).pipe(
  Q.from(users)
)

type ListUsersRow = Q.ResultRow<typeof listUsers>
// {
//   id: string
//   profile: {
//     email: string
//   }
//   hasPosts: boolean
// }
```

Projection typing is local. You usually do not need to define row interfaces yourself.

### Bringing Sources Into Scope

`from(...)` and joins make referenced sources available to the plan. Derived tables, CTEs, and correlated sources stay typed.

```ts
import { Column as C, Function as F, Query as Q, Table } from "effect-qb/postgres"

const users = Table.make("users", {
  id: C.uuid().pipe(C.primaryKey),
  email: C.text(),
  bio: C.text().pipe(C.nullable)
})

const posts = Table.make("posts", {
  id: C.uuid().pipe(C.primaryKey),
  userId: C.uuid(),
  title: C.text().pipe(C.nullable),
  status: C.text()
})

const activePosts = Q.select({
    userId: posts.userId,
    title: posts.title
  }).pipe(
    Q.from(posts),
    Q.where(Q.isNotNull(posts.title)),
    Q.as("active_posts")
  )

const usersWithPosts = Q.select({
  userId: users.id,
  title: activePosts.title
}).pipe(
  Q.from(users),
  Q.innerJoin(activePosts, Q.eq(users.id, activePosts.userId))
)

type UsersWithPostsRow = Q.ResultRow<typeof usersWithPosts>
// {
//   userId: string
//   title: string
// }
```

The same source story applies to:

- `subquery.pipe(Q.with("alias"))`
- `subquery.pipe(Q.withRecursive("alias"))`
- `subquery.pipe(Q.lateral("alias"))`
- `Q.values(...)`
- `Q.unnest(...)`

### Filtering Rows

Predicates do more than render SQL. They can narrow result types and joined tables.

```ts
import { Column as C, Function as F, Query as Q, Table } from "effect-qb/postgres"

const users = Table.make("users", {
  id: C.uuid().pipe(C.primaryKey),
  email: C.text(),
  bio: C.text().pipe(C.nullable)
})

const posts = Table.make("posts", {
  id: C.uuid().pipe(C.primaryKey),
  userId: C.uuid(),
  title: C.text().pipe(C.nullable),
  status: C.text()
})

const titledPosts = Q.select({
  title: posts.title,
  upperTitle: F.upper(posts.title)
}).pipe(
  Q.from(posts),
  Q.where(Q.eq(posts.title, "hello"))
)

type TitledPostsRow = Q.ResultRow<typeof titledPosts>
// {
//   title: string
//   upperTitle: string
// }
```

The same nullability proof also comes from operators like `gt(...)`, `gte(...)`, `lt(...)`, `lte(...)`, `in(...)`, and `notIn(...)` when they exclude `null`.

That same narrowing feeds:

- `coalesce(...)`
- `case()`
- `match(...)`
- joined-source promotion

### Shaping Results

The expression surface is large, but the important point is that result-shaping expressions stay typed.

```ts
import * as Schema from "effect/Schema"
import { Column as C, Function as F, Query as Q, Table } from "effect-qb/postgres"

const users = Table.make("users", {
  id: C.uuid().pipe(C.primaryKey),
  email: C.text(),
  bio: C.text().pipe(C.nullable)
})

const posts = Table.make("posts", {
  id: C.uuid().pipe(C.primaryKey),
  userId: C.uuid(),
  title: C.text().pipe(C.nullable),
  status: C.text()
})

const docs = Table.make("docs", {
  id: C.uuid().pipe(C.primaryKey),
  payload: C.json(Schema.Struct({
    profile: Schema.Struct({
      address: Schema.Struct({
        city: Schema.String
      })
    })
  }))
})

const cityPath = F.json.path(
  F.json.key("profile"),
  F.json.key("address"),
  F.json.key("city")
)

const shapedDocs = Q.select({
  title: Q.case()
    .when(Q.isNull(posts.title), "missing")
    .else(F.upper(posts.title)),
  profileCity: F.json.text(docs.payload, cityPath),
  titleAsText: Q.cast(posts.title, Q.type.text())
}).pipe(
  Q.from(posts),
  Q.leftJoin(docs, Q.eq(posts.id, docs.id))
)
```

The same JSON path object can be reused across:

- `Function.json.get(...)`
- `Function.json.text(...)`
- `Function.json.set(...)`
- `Function.json.insert(...)`
- `Function.json.delete(...)`
- `Function.json.pathExists(...)`

Comparison and cast safety are dialect-aware. Incompatible operands are rejected unless you make the conversion explicit with `Q.cast(...)`.

### Aggregating

Grouped queries are checked structurally, not just by source provenance.

```ts
import { Column as C, Function as F, Query as Q, Table } from "effect-qb/postgres"

const users = Table.make("users", {
  id: C.uuid().pipe(C.primaryKey),
  email: C.text(),
  bio: C.text().pipe(C.nullable)
})

const posts = Table.make("posts", {
  id: C.uuid().pipe(C.primaryKey),
  userId: C.uuid(),
  title: C.text().pipe(C.nullable),
  status: C.text()
})

const invalidPostsPerUser = Q.select({
  userId: users.id,
  title: posts.title,
  postCount: F.count(posts.id)
}).pipe(
  Q.from(users),
  Q.leftJoin(posts, Q.eq(users.id, posts.userId)),
  Q.groupBy(users.id)
)

type InvalidPostsPerUser = Q.CompletePlan<typeof invalidPostsPerUser>
// {
//   __effect_qb_error__: "effect-qb: invalid grouped selection"
//   __effect_qb_hint__:
//     "Scalar selections must be covered by groupBy(...) when aggregates are present"
// }

const postsPerUser = Q.select({
  userId: users.id,
  postCount: F.count(posts.id)
}).pipe(
  Q.from(users),
  Q.leftJoin(posts, Q.eq(users.id, posts.userId)),
  Q.groupBy(users.id)
)

type PostsPerUserRow = Q.ResultRow<typeof postsPerUser>
// {
//   userId: string
//   postCount: number
// }
```

This catches invalid grouped queries before rendering, then the fixed plan keeps only grouped or aggregate selections.

### Combining Queries

Subqueries and set operators stay part of the same typed plan model.

```ts
import { Column as C, Function as F, Query as Q, Table } from "effect-qb/postgres"

const users = Table.make("users", {
  id: C.uuid().pipe(C.primaryKey),
  email: C.text(),
  bio: C.text().pipe(C.nullable)
})

const posts = Table.make("posts", {
  id: C.uuid().pipe(C.primaryKey),
  userId: C.uuid(),
  title: C.text().pipe(C.nullable),
  status: C.text()
})

const postsByUser = Q.select({
  id: posts.id
}).pipe(
  Q.from(posts),
  Q.where(Q.eq(posts.userId, users.id))
)

const usersWithPosts = Q.select({
  userId: users.id,
  hasPosts: Q.exists(postsByUser)
}).pipe(
  Q.from(users)
)

type UsersWithPostsRow = Q.ResultRow<typeof usersWithPosts>
// {
//   userId: string
//   hasPosts: boolean
// }
```

Set operators require compatible row shapes:

- `Q.union(...)`
- `Q.unionAll(...)`
- `Q.intersect(...)`
- `Q.intersectAll(...)`
- `Q.except(...)`
- `Q.exceptAll(...)`

### Controlling Result Sets

Ordering and result-set controls are regular plan transforms:

```ts
import { Column as C, Query as Q, Table } from "effect-qb/postgres"

const users = Table.make("users", {
  id: C.uuid().pipe(C.primaryKey),
  email: C.text(),
  bio: C.text().pipe(C.nullable)
})

const recentUsers = Q.select({
  id: users.id,
  email: users.email
}).pipe(
  Q.from(users),
  Q.distinct(),
  Q.orderBy(users.email),
  Q.limit(10),
  Q.offset(20)
)
```

Postgres-only `distinct on` is available from the Postgres entrypoint:

```ts
import { Column as C, Query as Q, Table } from "effect-qb/postgres"

const users = Table.make("users", {
  id: C.uuid().pipe(C.primaryKey),
  email: C.text(),
  bio: C.text().pipe(C.nullable)
})

const recentEmails = Q.select({
  id: users.id,
  email: users.email
}).pipe(
  Q.from(users),
  Q.distinctOn(users.email),
  Q.orderBy(users.email)
)
```

## Mutations

### Insert

Single-row inserts are direct:

```ts
const insertUser = Q.insert(users, {
  id: "user-1",
  email: "alice@example.com"
})
```

If every writable column is optional because of `C.default(...)`, `C.generated(...)`, or nullability, `Q.insert(table)` is the default-only form.

Composable sources are available when the input rows come from elsewhere:

```ts
const pendingUsers = Q.values([
  { id: "user-1", email: "alice@example.com" },
  { id: "user-2", email: "bob@example.com" }
]).pipe(
  Q.as("pending_users")
)

const insertMany = Q.insert(users).pipe(
  Q.from(pendingUsers)
)
```

`from(...)` also accepts `select(...)`, `unnest(...)`, and other compatible sources.

### Update

Updates stay expression-aware and can use `from(...)` sources where the dialect supports it.

```ts
const updateUsers = Q.update(users, {
  email: "author@example.com"
}).pipe(
  Q.from(posts),
  Q.where(Q.and(
    Q.eq(posts.userId, users.id),
    Q.eq(posts.title, "hello")
  ))
)
```

The assigned values still have to be type-compatible with the target columns.

### Delete

Deletes keep their own statement kind and can also participate in typed conditions and `returning(...)`.

```ts
const deleteUser = Q.delete(users).pipe(
  Q.where(Q.eq(users.id, "user-1"))
)
```

### Conflicts And Upserts

Conflict handling is modeled as a composable modifier instead of a string escape hatch.

```ts
const insertOrIgnore = Q.insert(users, {
  id: "user-1",
  email: "alice@example.com"
}).pipe(
  Q.onConflict(["id"] as const, {
    action: "doNothing"
  })
)

const upsertUser = Q.insert(users, {
  id: "user-1",
  email: "alice@example.com"
}).pipe(
  Q.onConflict(["id"] as const, {
    update: {
      email: Q.excluded(users.email)
    }
  })
)
```

Conflict targets are checked against the target table.

### Returning

Mutation plans can project typed rows with `returning(...)`.

```ts
const insertedUser = Q.insert(users, {
  id: "user-1",
  email: "alice@example.com"
}).pipe(
  Q.returning({
    id: users.id,
    email: users.email
  })
)

type InsertedUserRow = Q.ResultRow<typeof insertedUser>
// {
//   id: string
//   email: string
// }
```

### Data-modifying CTEs

Write plans can feed later reads in the same statement:

```ts
const insertedUsers = Q.insert(users, {
  id: "user-1",
  email: "alice@example.com"
}).pipe(
  Q.returning({
    id: users.id,
    email: users.email
  }),
  Q.with("inserted_users")
)

const insertedUsersPlan = Q.select({
  id: insertedUsers.id,
  email: insertedUsers.email
}).pipe(
  Q.from(insertedUsers)
)
```

This is one of the places where the capability model matters: write-bearing nested plans keep write-required dialect errors in the executor error channel.

## Rendering And Execution

### Renderer

```ts
import { Renderer as PostgresRenderer } from "effect-qb/postgres"

const rendered = PostgresRenderer.make().render(postsPerUser)

rendered.sql
rendered.params
rendered.projections
```

Rendered queries carry:

- SQL text
- ordered bind params
- projection metadata
- the row type as a phantom type

They do not carry a query-result schema.

### Executor

```ts
import { Executor as PostgresExecutor, Query as Q } from "effect-qb/postgres"

const executor = PostgresExecutor.make()

const rowsEffect = executor.execute(postsPerUser)

type Rows = Q.ResultRows<typeof postsPerUser>
type Error = PostgresExecutor.PostgresQueryError<typeof postsPerUser>
```

Pass `{ renderer }`, `{ driver }`, or both when you need to customize execution.

Execution is:

1. render the plan
2. normalize raw driver values into canonical runtime values
3. apply schema-backed transforms where they exist
4. remap flat aliases into nested objects

There is no automatically derived whole-query schema.

### Query-sensitive Error Channels

Dialect executors expose query-sensitive error unions:

- `Postgres.Executor.PostgresQueryError<typeof plan>`
- `Mysql.Executor.MysqlQueryError<typeof plan>`

Those types are narrower than the raw dialect error catalogs. For example, known write-only failures are removed from read-query error channels, while write-bearing plans retain them.

### Transaction Helpers

```ts
import { Executor as PostgresExecutor } from "effect-qb/postgres"

const transactional = PostgresExecutor.withTransaction(rowsEffect)
const savepoint = PostgresExecutor.withSavepoint(rowsEffect)
```

These preserve the original effect type parameters and add the ambient SQL transaction boundary.

## Error Handling

The error system does more than expose raw driver failures. It gives you:

- generated dialect catalogs for known Postgres SQLSTATEs and MySQL error symbols
- normalization from driver-specific wire shapes into stable tagged unions
- rendered query context attached to execution failures when available
- query-capability narrowing so read-only plans do not expose write-only failures directly

The unusual part is that these are not separate features bolted together. The built-in executors normalize every driver failure at the execution boundary, attach rendered-query context, preserve the raw payload, and then narrow the resulting error surface against the query plan capabilities. Runtime behavior and type-level behavior stay aligned.

### Catalogs And Normalization

Both dialect entrypoints expose an `Errors` module:

```ts
import { Errors as PostgresErrors } from "effect-qb/postgres"
import { Errors as MysqlErrors } from "effect-qb/mysql"
```

The catalogs are backed by official vendor references:

- Postgres uses the SQLSTATE catalog from the current Appendix A docs
- MySQL uses the official server, client, and global error references

That means the tags and descriptor metadata are systematic, not handwritten one-offs.

Postgres errors normalize around SQLSTATE codes:

```ts
const descriptor = PostgresErrors.getPostgresErrorDescriptor("23505")
descriptor.tag
// "@postgres/integrity-constraint-violation/unique-violation"
descriptor.classCode
descriptor.className
descriptor.condition
descriptor.primaryFields

const postgresError = PostgresErrors.normalizePostgresDriverError({
  code: "23505",
  message: "duplicate key value violates unique constraint",
  constraint: "users_email_key"
})

postgresError._tag
postgresError.code
postgresError.constraintName
```

MySQL errors normalize around official symbols and documented numbers:

```ts
const descriptor = MysqlErrors.getMysqlErrorDescriptor("ER_DUP_ENTRY")
descriptor.tag
// "@mysql/server/dup-entry"
descriptor.category
descriptor.number
descriptor.sqlState
descriptor.messageTemplate

const mysqlError = MysqlErrors.normalizeMysqlDriverError({
  code: "ER_DUP_ENTRY",
  errno: 1062,
  sqlState: "23000",
  sqlMessage: "Duplicate entry 'alice@example.com' for key 'users.email'"
})

mysqlError._tag
mysqlError.symbol
mysqlError.number
```

The two dialects are intentionally modeled differently:

- Postgres is SQLSTATE-first. Normalized errors expose `code`, `classCode`, `className`, `condition`, and the semantic fields associated with that SQLSTATE.
- MySQL is symbol-first. Normalized errors expose `symbol`, `number`, `category`, `documentedSqlState`, and the official message template from the generated catalog.

Normalization preserves structured fields where the driver provides them. For example:

- Postgres surfaces fields like `detail`, `hint`, `position`, `schemaName`, `tableName`, and `constraintName`
- MySQL surfaces fields like `errno`, `sqlState`, `sqlMessage`, `fatal`, `syscall`, `address`, and `port`

Normalized errors also preserve the original payload on `raw` for known and catalog-miss cases, so you can still reach driver-specific data without losing the stable tagged surface.

Unknown failures are still classified:

- Postgres uses `@postgres/unknown/sqlstate` for well-formed but uncataloged SQLSTATEs and `@postgres/unknown/driver` for non-Postgres failures
- MySQL uses `@mysql/unknown/code` for MySQL-like catalog misses and `@mysql/unknown/driver` for non-MySQL failures

That fallback behavior is deliberate. Future server versions can introduce new codes without collapsing the executor back to `unknown`.

The normalized runtime variants are:

- Postgres: known SQLSTATE error, unknown SQLSTATE error, unknown driver error
- MySQL: known catalog error, unknown MySQL code error, unknown driver error

When normalization happens during execution, the normalized error also carries `query.sql` and `query.params`.

One MySQL-specific detail: number lookups can be ambiguous because one documented number may correspond to multiple official symbols. The catalog API preserves that instead of guessing:

```ts
const descriptors =
  Mysql.Errors.findMysqlErrorDescriptorsByNumber("MY-015144")
```

### Query-capability Narrowing

Executors narrow their error channels based on what the plan is allowed to do.

This happens in the built-in `Executor.make(...)` and `Executor.driver(...)` paths. They normalize the raw failure first, then decide whether the plan should expose the full dialect error surface or the read-only narrowed surface.

That matters most for read-only plans. If a raw driver error clearly requires write capabilities, the executor does not surface it directly on a read query. It wraps it in a query-requirements error instead:

- `@postgres/unknown/query-requirements`
- `@mysql/unknown/query-requirements`

Those wrappers include:

- `requiredCapabilities`
- `actualCapabilities`
- `cause`
- `query`

This makes the error channel honest about the plan you executed. A plain `select(...)` should not advertise direct unique-violation handling as though it were a write plan, even if the underlying driver returned one.

If the plan really is write-bearing, including write CTEs, the original normalized write error is preserved.

This is reflected at the type level too:

```ts
import { Executor as PostgresExecutor } from "effect-qb/postgres"

type ReadError =
  PostgresExecutor.PostgresQueryError<typeof readPlan>

type WriteError =
  PostgresExecutor.PostgresQueryError<typeof writePlan>
```

For a read-only plan, `ReadError` is the narrowed read-query surface. For a write-bearing plan, `WriteError` is the full normalized Postgres executor error surface. The MySQL executor follows the same rule.

### Matching Errors In Application Code

The executor error channel is intended to be pattern-matched, not string-parsed.

Use Effect tag handling for high-level branching:

```ts
import * as Effect from "effect/Effect"

const rows = executor.execute(plan).pipe(
  Effect.catchTag("@postgres/unknown/query-requirements", (error) =>
    Effect.fail(error.cause)
  )
)
```

Use the dialect guards for precise narrowing inside shared helpers:

```ts
if (PostgresErrors.hasSqlState(error, "23505")) {
  error.constraintName
}

if (MysqlErrors.hasSymbol(error, "ER_DUP_ENTRY")) {
  error.number
}

if (MysqlErrors.hasNumber(error, "1062")) {
  error.symbol
}
```

The recommended pattern is:

- match `_tag` for application-level control flow
- use `hasSqlState(...)`, `hasSymbol(...)`, or `hasNumber(...)` for dialect-specific detail work
- fall back to `query`, `raw`, and structured fields when you need logging or translation

Because the tags are catalog-derived, they are stable enough to use as application error boundaries without inventing a second error taxonomy in your app.

In practice, the error flow is:

1. driver throws some unknown failure
2. dialect normalizer turns it into a tagged dialect error
3. executor optionally narrows it against plan capabilities
4. application code matches on `_tag` or a dialect guard
5. application code decides whether to recover, rethrow, or translate the failure

## Type Safety

This is the main reason to use `effect-qb`.

### Complete-plan Enforcement

Partial plans are allowed while composing, but incomplete plans fail at the enforcement boundary.

```ts
import { Column as C, Query as Q, Table } from "effect-qb/postgres"

const users = Table.make("users", {
  id: C.uuid().pipe(C.primaryKey),
  email: C.text(),
  bio: C.text().pipe(C.nullable)
})

const missingFrom = Q.select({
  userId: users.id
})

type MissingFrom = Q.CompletePlan<typeof missingFrom>
// {
//   __effect_qb_error__:
//     "effect-qb: query references sources that are not yet in scope"
//   __effect_qb_missing_sources__: "users"
//   __effect_qb_hint__:
//     "Add from(...) or a join for each referenced source before render or execute"
// }
```

The same branded error shape applies when `where(...)`, joins, or projections reference sources that never enter scope.

### Predicate-driven Narrowing

Predicates refine result types, not just SQL.

```ts
import { Column as C, Function as F, Query as Q, Table } from "effect-qb/postgres"

const users = Table.make("users", {
  id: C.uuid().pipe(C.primaryKey),
  email: C.text(),
  bio: C.text().pipe(C.nullable)
})

const posts = Table.make("posts", {
  id: C.uuid().pipe(C.primaryKey),
  userId: C.uuid(),
  title: C.text().pipe(C.nullable),
  status: C.text()
})

const helloPosts = Q.select({
  title: posts.title,
  upperTitle: F.upper(posts.title)
}).pipe(
  Q.from(posts),
  Q.where(Q.eq(posts.title, "hello"))
)

type HelloPostsRow = Q.ResultRow<typeof helloPosts>
// {
//   title: string
//   upperTitle: string
// }
```

Equality against a non-null literal narrows too. You do not need `isNotNull(...)` to get non-null output, and the same applies to range and set operators that prove the value is present.

When the predicate references a joined source, that proof can promote the whole source, not just the filtered column.

```ts
import { Column as C, Function as F, Query as Q, Table } from "effect-qb/postgres"

const users = Table.make("users", {
  id: C.uuid().pipe(C.primaryKey),
  email: C.text(),
  bio: C.text().pipe(C.nullable)
})

const posts = Table.make("posts", {
  id: C.uuid().pipe(C.primaryKey),
  userId: C.uuid(),
  title: C.text().pipe(C.nullable),
  status: C.text()
})

const promotedJoinedPosts = Q.select({
  userId: users.id,
  postId: posts.id,
  postTitle: posts.title,
  upperTitle: F.upper(posts.title)
}).pipe(
  Q.from(users),
  Q.leftJoin(posts, Q.eq(users.id, posts.userId)),
  Q.where(Q.eq(posts.title, "hello"))
)

type PromotedJoinedPostsRow = Q.ResultRow<typeof promotedJoinedPosts>
// {
//   userId: string
//   postId: string
//   postTitle: string
//   upperTitle: string
// }
```

### Join Optionality

Left joins start conservative. Predicates can promote them, and `isNull(...)` can prove the opposite.

```ts
import { Column as C, Function as F, Query as Q, Table } from "effect-qb/postgres"

const users = Table.make("users", {
  id: C.uuid().pipe(C.primaryKey),
  email: C.text(),
  bio: C.text().pipe(C.nullable)
})

const posts = Table.make("posts", {
  id: C.uuid().pipe(C.primaryKey),
  userId: C.uuid(),
  title: C.text().pipe(C.nullable),
  status: C.text()
})

const maybePosts = Q.select({
  userId: users.id,
  postId: posts.id
}).pipe(
  Q.from(users),
  Q.leftJoin(posts, Q.eq(users.id, posts.userId))
)

type MaybePostsRow = Q.ResultRow<typeof maybePosts>
// {
//   userId: string
//   postId: string | null
// }
```

Any non-null proof on the joined table can promote the whole joined source, not just the join key.

```ts
import { Column as C, Function as F, Query as Q, Table } from "effect-qb/postgres"

const users = Table.make("users", {
  id: C.uuid().pipe(C.primaryKey),
  email: C.text(),
  bio: C.text().pipe(C.nullable)
})

const posts = Table.make("posts", {
  id: C.uuid().pipe(C.primaryKey),
  userId: C.uuid(),
  title: C.text().pipe(C.nullable),
  status: C.text()
})

const comments = Table.make("comments", {
  id: C.uuid().pipe(C.primaryKey),
  postId: C.uuid(),
  body: C.text()
})

const absentAcrossDependentLeftJoins = Q.select({
  userId: users.id,
  postId: posts.id,
  commentId: comments.id,
  commentBody: comments.body
}).pipe(
  Q.from(users),
  Q.leftJoin(posts, Q.eq(users.id, posts.userId)),
  Q.leftJoin(comments, Q.eq(posts.id, comments.postId)),
  Q.where(Q.isNull(posts.id))
)

type AbsentAcrossDependentLeftJoinsRow = Q.ResultRow<typeof absentAcrossDependentLeftJoins>
// {
//   userId: string
//   postId: null
//   commentId: null
//   commentBody: null
// }
```

`isNull(...)` on an optional source does not just make one column nullable. It can collapse the source itself to `null`, and dependent joins that hang off it collapse with it.

### Grouped Query Validation

Grouped queries are checked structurally:

```ts
import { Column as C, Function as F, Query as Q, Table } from "effect-qb/postgres"

const users = Table.make("users", {
  id: C.uuid().pipe(C.primaryKey),
  email: C.text(),
  bio: C.text().pipe(C.nullable)
})

const posts = Table.make("posts", {
  id: C.uuid().pipe(C.primaryKey),
  userId: C.uuid(),
  title: C.text().pipe(C.nullable),
  status: C.text()
})

const invalidGroupedPlan = Q.select({
  userId: users.id,
  title: posts.title,
  postCount: F.count(posts.id)
}).pipe(
  Q.from(users),
  Q.leftJoin(posts, Q.eq(users.id, posts.userId)),
  Q.groupBy(users.id)
)

type InvalidGroupedPlan = Q.CompletePlan<typeof invalidGroupedPlan>
// {
//   __effect_qb_error__: "effect-qb: invalid grouped selection"
//   __effect_qb_hint__:
//     "Scalar selections must be covered by groupBy(...) when aggregates are present"
// }
```

This catches invalid grouped queries before rendering.

### Dialect Compatibility

Plans, tables, renderers, and executors are dialect-branded.

```ts
import { Column as MysqlColumn, Query as MysqlQuery, Table as MysqlTable } from "effect-qb/mysql"
import { Executor as PostgresExecutor } from "effect-qb/postgres"

const mysqlUsers = MysqlTable.make("users", {
  id: MysqlColumn.uuid().pipe(MysqlColumn.primaryKey)
})

const mysqlPlan = MysqlQuery.select({
  id: mysqlUsers.id
}).pipe(
  MysqlQuery.from(mysqlUsers)
)

const postgresExecutor = PostgresExecutor.make()

// @ts-expect-error mysql plans are not dialect-compatible with the postgres executor
postgresExecutor.execute(mysqlPlan)
// effect-qb: plan dialect is not compatible with the target renderer or executor
```

### JSON Schema Compatibility In Mutations

Schema-backed JSON columns are checked on insert and update.

```ts
import * as Schema from "effect/Schema"
import { Column as C, Function as F, Query as Q, Table } from "effect-qb/postgres"

const docs = Table.make("docs", {
  id: C.uuid().pipe(C.primaryKey),
  payload: C.json(Schema.Struct({
    profile: Schema.Struct({
      address: Schema.Struct({
        city: Schema.String,
        postcode: Schema.NullOr(Schema.String)
      }),
      tags: Schema.Array(Schema.String)
    }),
    note: Schema.NullOr(Schema.String)
  }))
})

const cityPath = F.json.path(
  F.json.key("profile"),
  F.json.key("address"),
  F.json.key("city")
)

const compatibleObject = F.json.buildObject({
  profile: {
    address: {
      postcode: "1000"
    },
    tags: ["travel"]
  },
  note: null
})

const incompatibleObject = F.json.delete(compatibleObject, cityPath)

Q.insert(docs, {
  id: "doc-1",
  // @ts-expect-error nested json output must still satisfy the column schema
  payload: incompatibleObject
})
```

For updates, column-derived JSON expressions are checked too:

```ts
Q.update(docs, {
  // @ts-expect-error deleting a required field makes the json output incompatible
  payload: deletedRequiredField
})
```

The same compatibility checks apply anywhere a mutation assigns to a schema-backed JSON column.

### Readable Branded Type Errors

The library favors branded type errors over silent `never` collapse. Typical diagnostics include:

- `__effect_qb_error__`
- `__effect_qb_hint__`
- `__effect_qb_missing_sources__`
- `__effect_qb_plan_dialect__`
- `__effect_qb_target_dialect__`

That makes invalid plans easier to inspect in editor tooltips and type aliases.

## Dialect Support

### PostgreSQL

- `effect-qb/postgres`
- `distinctOn(...)`
- wider JSON operator surface, including `json.pathMatch(...)`
- schema-qualified tables default to `public`
- `Postgres.Executor.PostgresQueryError<typeof plan>`

### MySQL

- dialect-specific table and query entrypoint via `effect-qb/mysql`
- `distinctOn(...)` is rejected with a branded type error
- JSON support is broad but not identical to Postgres
- schema names map to database-qualified table references
- `Mysql.Executor.MysqlQueryError<typeof plan>`

Meaningful differences should be expected around:

- JSON operator support
- mutation syntax
- error normalization
- schema defaults

## Limitations

This README is curated. It documents the main workflows and type-safety contract, not every API detail.

Current practical limits:

- some features are dialect-specific by design
- JSON support is not identical between Postgres and MySQL
- admin and DDL workflows are not the focus of this README
- runtime schema enforcement follows propagated column and projection schemas, not full query-derived schemas

## Contributing

Useful commands:

```bash
bun test
bun run test:types
bun run test:integration
bun run release
```

Useful places to start:

- [packages/querybuilder/src/postgres.ts](./packages/querybuilder/src/postgres.ts)
- [packages/querybuilder/src/internal/query-factory.ts](./packages/querybuilder/src/internal/query-factory.ts)
- [packages/querybuilder/src/postgres/private/query.ts](./packages/querybuilder/src/postgres/private/query.ts)
- [test/public/behavior/query.behavior.test.ts](./test/public/behavior/query.behavior.test.ts)
- [test/public/types/query-composition-types.ts](./test/public/types/query-composition-types.ts)

The codebase is organized around typed plans, dialect-specialized entrypoints, and behavior-first tests.
