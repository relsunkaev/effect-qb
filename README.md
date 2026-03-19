# effect-qb

Type-safe SQL plans that understand query semantics.

## Table of Contents

- [Overview](#overview)
- [What The Compiler Proves](#what-the-compiler-proves)
- [Installation](#installation)
- [Choose An Entrypoint](#choose-an-entrypoint)
- [Quick Start](#quick-start)
- [Execution Model](#execution-model)
- [Feature Map](#feature-map)
- [Core Concepts](#core-concepts)
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
- [Non-goals](#non-goals)
- [Limitations](#limitations)
- [Contributing](#contributing)

## Overview

Most query builders can infer the columns you selected. `effect-qb` goes further: it models a query as a typed plan, so TypeScript can catch semantic SQL mistakes before you render or execute anything.

`effect-qb` exists because "typed SQL" usually stops too early. Inferring `{ id: string; name: string }` from `select(...)` is useful, but it does not tell you whether the query is logically valid. This library is for teams who want the compiler to reason about what the query proves, not just what it projects.

`effect-qb` is not an ORM. It is a typed SQL planner and execution layer for teams that want stronger guarantees without giving up explicit query construction.

If your goal is a thin runtime DSL over SQL, this is probably too much. If your goal is to make query logic reviewable by the compiler, this is the point of the library.

`effect-qb` catches problems such as:

- a left join still being nullable until a predicate proves the joined row exists
- grouped selections that are not actually valid SQL
- referenced sources that never enter scope
- Postgres-only constructs leaking into a MySQL plan
- JSON writes that no longer match the target column schema

```ts
import { Column as C, Query as Q, Table } from "effect-qb/postgres"

const users = Table.make("users", {
  id: C.uuid().pipe(C.primaryKey)
})

const posts = Table.make("posts", {
  id: C.uuid().pipe(C.primaryKey),
  userId: C.uuid(),
  title: C.text().pipe(C.nullable)
})

const guaranteedPost = Q.select({
  userId: users.id,
  postId: posts.id,
  title: posts.title
}).pipe(
  Q.from(users),
  Q.leftJoin(posts, Q.eq(users.id, posts.userId)),
  Q.where(Q.isNotNull(posts.id))
)

type LogicalRow = Q.ResultRow<typeof guaranteedPost>
// {
//   userId: string
//   postId: string
//   title: string | null
// }
```

`Q.ResultRow<typeof plan>` reflects what the query proves. `Q.RuntimeResultRow<typeof plan>` stays conservative and describes the schema-free runtime remap shape. The same ergonomic narrowing applies when predicates like `where(Q.eq(nullableColumn, nonNullValue))` prove a value cannot be null.

The main contract is compile-time. At runtime, the library renders SQL, executes it, and remaps aliased columns back into nested objects. It does not build or validate query-result schemas.

## What The Compiler Proves

`effect-qb` is strongest when the compiler can carry facts from one part of the query into another. In practice that means:

- `where(Q.isNotNull(posts.title))` can narrow both `posts.title` and expressions derived from it
- `leftJoin(...)` plus a proven non-null column from the joined table can promote that source from optional to required
- `Q.CompletePlan<typeof plan>` rejects missing sources and invalid grouped selections before render or execute
- passing a MySQL plan to a Postgres executor is rejected at the call site
- JSON mutation expressions still have to match the target column schema on `insert(...)` and `update(...)`

Those are the core guarantees. The rest of the API exists to make those proofs composable.

## Installation

```bash
bun install
```

## Choose An Entrypoint

Available entrypoints:

- `effect-qb/postgres`
- `effect-qb/mysql`

Use `effect-qb/postgres` when Postgres defaults are acceptable. Use the dialect-specific entrypoints when you want dialect-locked table builders, query builders, renderers, executors, datatypes, and error types.

## Quick Start

```ts
import { Column as C, Executor, Query as Q, Renderer, Table } from "effect-qb/postgres"

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
  postCount: Q.count(posts.id)
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

const renderer = Renderer.make()
const rendered = renderer.render(postsPerUser)
rendered.sql
rendered.params

const executor = Executor.make()
const rowsEffect = executor.execute(postsPerUser)

type Rows = Q.ResultRows<typeof postsPerUser>
```

This is the core model: define typed tables, build a plan, let the plan define the row type, then render or execute it through a dialect-specific renderer and executor.

## Execution Model

The runtime model is intentionally small:

1. build a typed plan
2. render SQL plus bind params
3. execute the statement
4. remap flat aliases like `profile__email` back into nested objects

What it does not do is decode rows against a runtime schema. `Q.ResultRow<typeof plan>` is the logical static result, while `Q.RuntimeResultRow<typeof plan>` is the conservative runtime shape.

```ts
import * as SqlClient from "@effect/sql/SqlClient"
import * as Effect from "effect/Effect"
import * as Postgres from "effect-qb/postgres"

const renderer = Postgres.Renderer.make()
const executor = Postgres.Executor.fromSqlClient(renderer)

const rowsEffect = executor.execute(postsPerUser)

const rows = Effect.runSync(
  Effect.provideService(rowsEffect, SqlClient.SqlClient, sqlClient)
)
```

If you want runtime validation, add it after execution.

## Feature Map

The rest of this README goes deeper, but the main surface area is:

- table builders with keys, indexes, nullability, defaults, and schema-backed JSON columns
- select plans with joins, CTEs, derived tables, `values(...)`, `unnest(...)`, subqueries, and set operators
- mutation plans for `insert`, `update`, `delete`, `returning`, and conflict handling
- renderers and executors for Postgres and MySQL
- type-level checks for missing sources, grouped selections, dialect compatibility, and JSON mutation compatibility

Dialect-specific capabilities are called out later. Postgres currently has the wider feature surface in a few areas such as `distinctOn(...)`, `generateSeries(...)`, and some JSON operators.

## Core Concepts

### Tables And Columns

Tables are typed sources, not loose name strings. Columns carry DB types, nullability, defaults, keys, and schema-backed JSON information.

```ts
import * as Schema from "effect/Schema"
import { Column as C, Table } from "effect-qb/postgres"

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
import { Column as C, Table } from "effect-qb/postgres"

const analytics = Table.schema("analytics")

const events = analytics.table("events", {
  id: C.uuid().pipe(C.primaryKey),
  userId: C.uuid()
})
```

### Plans, Not Strings

`effect-qb` does not build rows from ad hoc string fragments. It builds typed plans. Partial plans are allowed while assembling a query, but rendering and execution require a complete plan.

That distinction is important:

- you can reference sources before they are in scope while composing
- the type system tracks what is still missing
- `render(...)`, `execute(...)`, and `Q.CompletePlan<typeof plan>` are the enforcement boundary

### ResultRow vs RuntimeResultRow

`Q.ResultRow<typeof plan>` is the logical result type after static analysis. It includes things like:

- `where(isNotNull(...))` nullability refinement
- left-join promotion when predicates prove presence
- grouped-query validation
- branch pruning for expressions like `case()`

`Q.RuntimeResultRow<typeof plan>` is intentionally more conservative. It describes the schema-free runtime remap path only.

```ts
import { Query as Q } from "effect-qb/postgres"

const titledPosts = Q.select({
  title: posts.title,
  upperTitle: Q.upper(posts.title)
}).pipe(
  Q.from(posts),
  Q.where(Q.isNotNull(posts.title))
)

type LogicalRow = Q.ResultRow<typeof titledPosts>
// {
//   title: string
//   upperTitle: string
// }

type RuntimeRow = Q.RuntimeResultRow<typeof titledPosts>
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
import { Column as C, Query as Q, Table } from "effect-qb/postgres"

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

const cityPath = Q.json.path(
  Q.json.key("profile"),
  Q.json.key("address"),
  Q.json.key("city")
)

const city = Q.json.get(docs.payload, cityPath)
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
import { Column as MyC, Query as MyQ, Table as MyTable } from "effect-qb/mysql"
import { Column as PgC, Query as PgQ, Table as PgTable } from "effect-qb/postgres"
```

This matters for:

- dialect-locked tables and columns
- dialect-only features like Postgres `distinctOn(...)`
- dialect-specific renderers and executors
- dialect-specific error unions

## Query Guide

Unless noted otherwise, the examples below reuse the same `users`, `posts`, and `docs` tables introduced earlier.

### Selecting Data

Selections define the result type directly. Nested objects stay nested in the row type.

```ts
import { Query as Q } from "effect-qb/postgres"

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
//   hasPosts: true
// }
```

Projection typing is local. You usually do not need to define row interfaces yourself.

### Bringing Sources Into Scope

`from(...)` and joins make referenced sources available to the plan. Derived tables, CTEs, and correlated sources stay typed.

```ts
import { Query as Q } from "effect-qb/postgres"

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

- `Q.with(subquery, alias)`
- `Q.withRecursive(subquery, alias)`
- `Q.lateral(subquery, alias)`
- `Q.values(...).pipe(Q.as("alias"))`
- `Q.unnest(...)`

### Filtering Rows

Predicates do more than render SQL. They can narrow result types.

```ts
import { Query as Q } from "effect-qb/postgres"

const matchingPosts = Q.select({
  title: posts.title,
  upperTitle: Q.upper(posts.title)
}).pipe(
  Q.from(posts),
  Q.where(Q.eq(posts.title, "Hello"))
)

type MatchingPostsRow = Q.ResultRow<typeof matchingPosts>
// {
//   title: string
//   upperTitle: string
// }
```

Equality against a non-null value is enough to prove the nullable column is present.

That same narrowing feeds:

- `coalesce(...)`
- `case()`
- `match(...)`
- joined-source promotion

### Shaping Results

The expression surface is large, but the important point is that result-shaping expressions stay typed.

```ts
import * as Schema from "effect/Schema"
import { Column as C, Query as Q, Table } from "effect-qb/postgres"

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

const cityPath = Q.json.path(
  Q.json.key("profile"),
  Q.json.key("address"),
  Q.json.key("city")
)

const shapedDocs = Q.select({
  title: Q.case()
    .when(Q.isNull(posts.title), "missing")
    .else(Q.upper(posts.title)),
  profileCity: Q.json.text(docs.payload, cityPath),
  titleAsText: Q.cast(posts.title, Q.type.text())
}).pipe(
  Q.from(posts),
  Q.leftJoin(docs, Q.eq(posts.id, docs.id))
)
```

The same JSON path object can be reused across:

- `Q.json.get(...)`
- `Q.json.text(...)`
- `Q.json.set(...)`
- `Q.json.insert(...)`
- `Q.json.delete(...)`
- `Q.json.pathExists(...)`

Comparison and cast safety are dialect-aware. Incompatible operands are rejected unless you make the conversion explicit with `Q.cast(...)`.

### Aggregating

Grouped queries are checked structurally, not just by source provenance.

```ts
import { Query as Q } from "effect-qb/postgres"

const invalidPostsPerUser = Q.select({
  userId: users.id,
  postCount: Q.count(posts.id),
  title: posts.title
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
```

Scalar selections must be covered by `groupBy(...)` when aggregates are present. Invalid grouped selections are rejected at the complete-plan boundary.

### Combining Queries

Subqueries and set operators stay part of the same typed plan model.

```ts
import { Query as Q } from "effect-qb/postgres"

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
import { Query as Q } from "effect-qb/postgres"

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
import { Query as Q } from "effect-qb/postgres"

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
import { Query as Q } from "effect-qb/postgres"

const insertUser = Q.insert(users, {
  id: "user-1",
  email: "alice@example.com"
})
```

Composable sources are available when the input rows come from elsewhere:

```ts
import { Query as Q } from "effect-qb/postgres"

const insertMany = Q.insert(users).pipe(
  Q.from(Q.values([
    { id: "user-1", email: "alice@example.com" },
    { id: "user-2", email: "bob@example.com" }
  ]))
)
```

`Q.from(...)` also accepts `select(...)`, `unnest(...)`, and aliased `values(...)` sources.

### Update

Updates stay expression-aware and can use `update ... from ...` sources where the dialect supports it.

```ts
import { Query as Q } from "effect-qb/postgres"

const updateUsers = Q.update(users, {
  email: "has-posts@example.com"
}).pipe(
  Q.from(posts),
  Q.where(Q.eq(posts.userId, users.id))
)
```

The assigned values still have to be type-compatible with the target columns.

### Delete

Deletes keep their own statement kind and can also participate in typed conditions and `returning(...)`.

```ts
import { Query as Q } from "effect-qb/postgres"

const deleteUser = Q.delete(users).pipe(
  Q.where(Q.eq(users.id, "user-1"))
)
```

### Conflicts And Upserts

Conflict handling is modeled as a composable modifier instead of a string escape hatch.

```ts
import { Query as Q } from "effect-qb/postgres"

const insertOrIgnore = Q.insert(users, {
  id: "user-1",
  email: "alice@example.com"
}).pipe(
  Q.onConflict(["id"] as const)
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
import { Query as Q } from "effect-qb/postgres"

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
import { Query as Q } from "effect-qb/postgres"

const insertedUsers = Q.with(
  Q.insert(users, {
    id: "user-1",
    email: "alice@example.com"
  }).pipe(
    Q.returning({
      id: users.id,
      email: users.email
    })
  ),
  "inserted_users"
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
import { Renderer } from "effect-qb/postgres"

const rendered = Renderer.make().render(postsPerUser)

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
import { Executor, Query as Q } from "effect-qb/postgres"

const executor = Executor.make()

const rowsEffect = executor.execute(postsPerUser)

type Rows = Q.ResultRows<typeof postsPerUser>
type Error = Executor.PostgresQueryError<typeof postsPerUser>
```

Execution is:

1. render the plan
2. execute SQL
3. remap flat aliases into nested objects

There is no query-result schema decode stage.

### Query-sensitive Error Channels

Dialect executors expose query-sensitive error unions:

- `Postgres.Executor.PostgresQueryError<typeof plan>`
- `Mysql.Executor.MysqlQueryError<typeof plan>`

Those types are narrower than the raw dialect error catalogs. For example, known write-only failures are removed from read-query error channels, while write-bearing plans retain them.

### Transaction Helpers

```ts
import { Executor } from "effect-qb/postgres"

const transactional = Executor.withTransaction(rowsEffect)
const savepoint = Executor.withSavepoint(rowsEffect)
```

These preserve the original effect type parameters and add the ambient SQL transaction boundary.

## Error Handling

The error system does more than expose raw driver failures. It gives you:

- generated dialect catalogs for known Postgres SQLSTATEs and MySQL error symbols
- normalization from driver-specific wire shapes into stable tagged unions
- rendered query context attached to execution failures when available
- query-capability narrowing so read-only plans do not expose write-only failures directly

### Catalogs And Normalization

Both dialect entrypoints expose an `Errors` module:

```ts
import * as Postgres from "effect-qb/postgres"
import * as Mysql from "effect-qb/mysql"
```

Postgres errors normalize around SQLSTATE codes:

```ts
const descriptor = Postgres.Errors.getPostgresErrorDescriptor("23505")
descriptor.tag
// "@postgres/integrity-constraint-violation/unique-violation"

const postgresError = Postgres.Errors.normalizePostgresDriverError({
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
const descriptor = Mysql.Errors.getMysqlErrorDescriptor("ER_DUP_ENTRY")
descriptor.tag
// "@mysql/server/dup-entry"

const mysqlError = Mysql.Errors.normalizeMysqlDriverError({
  code: "ER_DUP_ENTRY",
  errno: 1062,
  sqlState: "23000",
  sqlMessage: "Duplicate entry 'alice@example.com' for key 'users.email'"
})

mysqlError._tag
mysqlError.symbol
mysqlError.number
```

Normalization preserves structured fields where the driver provides them. For example:

- Postgres surfaces fields like `detail`, `hint`, `position`, `schemaName`, `tableName`, and `constraintName`
- MySQL surfaces fields like `errno`, `sqlState`, `sqlMessage`, `fatal`, `syscall`, `address`, and `port`

Unknown failures are still classified:

- Postgres uses `@postgres/unknown/sqlstate` for well-formed but uncataloged SQLSTATEs and `@postgres/unknown/driver` for non-Postgres failures
- MySQL uses `@mysql/unknown/code` for MySQL-like catalog misses and `@mysql/unknown/driver` for non-MySQL failures

When normalization happens during execution, the normalized error also carries `query.sql` and `query.params`.

### Query-capability Narrowing

Executors narrow their error channels based on what the plan is allowed to do.

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

You can also inspect requirements directly:

```ts
const postgresRequirements =
  Postgres.Errors.requirements_of_postgres_error(postgresError)

const mysqlRequirements =
  Mysql.Errors.requirements_of_mysql_error(mysqlError)
```

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
if (Postgres.Errors.hasSqlState(error, "23505")) {
  error.constraintName
}

if (Mysql.Errors.hasSymbol(error, "ER_DUP_ENTRY")) {
  error.number
}

if (Mysql.Errors.hasNumber(error, "1062")) {
  error.symbol
}
```

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
import { Query as Q } from "effect-qb/postgres"

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
import { Column as C, Query as Q, Table } from "effect-qb/postgres"

const posts = Table.make("posts", {
  id: C.uuid().pipe(C.primaryKey),
  title: C.text().pipe(C.nullable)
})

const allPosts = Q.select({
  title: posts.title,
  lowerTitle: Q.lower(posts.title)
}).pipe(
  Q.from(posts)
)

type AllPostsRow = Q.ResultRow<typeof allPosts>
// {
//   title: string | null
//   lowerTitle: string | null
// }

const filteredPosts = allPosts.pipe(
  Q.where(Q.eq(posts.title, "Hello"))
)

type FilteredPostsRow = Q.ResultRow<typeof filteredPosts>
// {
//   title: string
//   lowerTitle: string
// }
```

The same idea applies to explicit null checks:

```ts
import { Query as Q } from "effect-qb/postgres"

const nonNullPosts = Q.select({
  title: posts.title,
  lowerTitle: Q.lower(posts.title)
}).pipe(
  Q.from(posts),
  Q.where(Q.isNotNull(posts.title))
)

type NonNullPostsRow = Q.ResultRow<typeof nonNullPosts>
// {
//   title: string
//   lowerTitle: string
// }
```

This is one of the biggest differences between `ResultRow` and a hand-written row interface.

### Join Optionality

Left joins start conservative. Predicates can promote them.

```ts
import { Query as Q } from "effect-qb/postgres"

const maybePosts = Q.select({
  userId: users.id,
  postId: posts.id,
  title: posts.title
}).pipe(
  Q.from(users),
  Q.leftJoin(posts, Q.eq(users.id, posts.userId))
)

type MaybePostsRow = Q.ResultRow<typeof maybePosts>
// {
//   userId: string
//   postId: string | null
//   title: string | null
// }

const guaranteedPosts = maybePosts.pipe(
  Q.where(Q.isNotNull(posts.title))
)

type GuaranteedPostsRow = Q.ResultRow<typeof guaranteedPosts>
// {
//   userId: string
//   postId: string
//   title: string
// }
```

Any proven non-null column from the optional joined source can promote that source. The same effect applies to predicates like `where(Q.eq(posts.title, "Hello"))`.

### Grouped Query Validation

Grouped queries are checked structurally:

```ts
import { Query as Q } from "effect-qb/postgres"

const invalidGroupedPlan = Q.select({
  userId: users.id,
  title: posts.title,
  postCount: Q.count(posts.id)
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

const validGroupedPlan = Q.select({
  userId: users.id,
  postCount: Q.count(posts.id)
}).pipe(
  Q.from(users),
  Q.leftJoin(posts, Q.eq(users.id, posts.userId)),
  Q.groupBy(users.id)
)

type ValidGroupedRow = Q.ResultRow<typeof validGroupedPlan>
// {
//   userId: string
//   postCount: number
// }
```

This catches invalid grouped queries before rendering. The fix is explicit: either group by the scalar expression too, or remove it from the projection.

### Dialect Compatibility

Plans, tables, renderers, and executors are dialect-branded.

```ts
import * as Effect from "effect/Effect"
import { Column as MyC, Query as MyQ, Table as MyTable } from "effect-qb/mysql"
import { Executor as PgExecutor } from "effect-qb/postgres"

const mysqlUsers = MyTable.make("users", {
  id: MyC.uuid().pipe(MyC.primaryKey)
})

const mysqlPlan = MyQ.select({
  id: mysqlUsers.id
}).pipe(
  MyQ.from(mysqlUsers)
)

const postgresExecutor = PgExecutor.custom(() =>
  Effect.succeed([] as const)
)

// @ts-expect-error mysql plans cannot be executed by postgres executors
postgresExecutor.execute(mysqlPlan)
// Argument of type 'typeof mysqlPlan' is not assignable here because:
//   __effect_qb_error__:
//     "effect-qb: plan dialect is not compatible with the target renderer or executor"
```

### JSON Schema Compatibility In Mutations

Schema-backed JSON columns are checked on insert and update.

```ts
import * as Schema from "effect/Schema"
import { Column as C, Query as Q, Table } from "effect-qb/postgres"

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

const cityPath = Q.json.path(
  Q.json.key("profile"),
  Q.json.key("address"),
  Q.json.key("city")
)

Q.insert(docs, {
  id: "doc-1",
  payload: Q.json.buildObject({
    profile: {
      address: {
        city: "Paris",
        postcode: null
      },
      tags: ["new"]
    },
    note: null
  })
})

const updatedPayload = Q.json.set(docs.payload, cityPath, "Paris")

Q.update(docs, {
  payload: updatedPayload
})

const deletedRequiredField = Q.json.delete(docs.payload, cityPath)

Q.update(docs, {
  // @ts-expect-error deleting a required field makes the json output incompatible
  payload: deletedRequiredField
})
```

For inserts, build a fresh JSON value that matches the column schema. For updates, JSON operators like `Q.json.set(...)` and `Q.json.delete(...)` are checked against the same schema before the mutation is allowed.

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

- recommended entrypoint when Postgres defaults are acceptable
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

```ts
import { Column as MyC, Query as MyQ, Renderer as MyRenderer, Table as MyTable } from "effect-qb/mysql"
import { Column as PgC, Query as PgQ, Renderer as PgRenderer, Table as PgTable } from "effect-qb/postgres"

const pgUsers = PgTable.make("users", {
  id: PgC.uuid().pipe(PgC.primaryKey)
})

const myUsers = MyTable.make("users", {
  id: MyC.uuid().pipe(MyC.primaryKey)
})

const pgPlan = PgQ.select({
  id: pgUsers.id
}).pipe(
  PgQ.from(pgUsers)
)

const myPlan = MyQ.select({
  id: myUsers.id
}).pipe(
  MyQ.from(myUsers)
)

PgRenderer.make().render(pgPlan).sql
// select "users"."id" as "id" from "public"."users"

MyRenderer.make().render(myPlan).sql
// select `users`.`id` as `id` from `users`
```

Meaningful differences should be expected around:

- JSON operator support
- mutation syntax
- error normalization
- schema defaults

## Non-goals

- no ORM model layer, identity map, or unit-of-work abstraction
- no migration framework or schema diff tool
- no runtime result validation by default
- no database-introspection-first API that generates queries for you

## Limitations

This README is curated. It documents the main workflows and type-safety contract, not every API detail.

Current practical limits:

- some features are dialect-specific by design
- JSON support is not identical between Postgres and MySQL
- admin and DDL workflows are not the focus of this README
- runtime execution is schema-free, so the database is expected to honor the query contract

## Contributing

Useful commands:

```bash
bun test
bun run test:types
```

Useful places to start:

- [src/internal/query.ts](./src/internal/query.ts)
- [src/internal/query-factory.ts](./src/internal/query-factory.ts)
- [test/query.behavior.test.ts](./test/query.behavior.test.ts)
- [test/types/query-composition-types.ts](./test/types/query-composition-types.ts)

The codebase is organized around typed plans, dialect-specialized entrypoints, and behavior-first tests.
