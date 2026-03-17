# effect-qb

Composable, type-safe SQL query construction for PostgreSQL and MySQL with static result contracts, predicate-driven narrowing, and a schema-free runtime query path.

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Modules](#modules)
- [Core Idea](#core-idea)
- [Define Tables](#define-tables)
- [Build Queries](#build-queries)
  - [Select and Infer the Result Shape](#select-and-infer-the-result-shape)
  - [Predicate-Driven Nullability Refinement](#predicate-driven-nullability-refinement)
  - [Left Joins: Static vs Runtime Row Types](#left-joins-static-vs-runtime-row-types)
  - [Case Expressions](#case-expressions)
  - [Aggregation and Grouping](#aggregation-and-grouping)
- [Query Construction Safety](#query-construction-safety)
- [Rendering](#rendering)
- [Execution](#execution)
- [Type Safety and Return Types](#type-safety-and-return-types)
- [Dialect Notes](#dialect-notes)
- [Unsupported Features](#unsupported-features)
- [Project Layout](#project-layout)
- [Contributing](#contributing)

## Overview

`effect-qb` builds immutable query plans and keeps the interesting parts of SQL in the type system:

- projection shape
- nullability
- join optionality
- aggregate compatibility
- dialect compatibility
- execution return types

The main contract is compile-time:

- `Query.ResultRow<typeof plan>` is the logical result type after predicate implication and query analysis
- `Query.RuntimeResultRow<typeof plan>` is the conservative runtime remap shape

At runtime, the library renders SQL, executes it, and remaps flat aliases back into nested objects. It does not build or validate query result schemas.

## Installation

```bash
bun install
```

Exports:

- `effect-qb`
- `effect-qb/postgres`
- `effect-qb/mysql`

## Modules

Core entrypoint:

```ts
import {
  Query as Q,
  Table,
  Column as C,
  Renderer,
  Executor,
  Expression,
  Plan
} from "effect-qb"
```

Dialect-specific entrypoints:

```ts
import * as Postgres from "effect-qb/postgres"
import * as Mysql from "effect-qb/mysql"
```

Notes:

- `effect-qb` exports the Postgres-flavored `Query` DSL by default.
- Use `effect-qb/mysql` when the query plan should be locked to MySQL.
- Use dialect-specific renderers/executors when you want built-in engine support for that dialect.

## Core Idea

The query path is split in two:

1. Static query analysis
   - result typing
   - nullability refinement
   - join promotion
   - aggregate/grouping checks
   - dialect compatibility
2. Runtime execution
   - render SQL
   - run SQL
   - remap flat aliases into nested objects

That means the runtime path stays small, while the type contract stays tight.

## Define Tables

```ts
import { Query as Q, Table, Column as C } from "effect-qb"

const users = Table.make("users", {
  id: C.uuid().pipe(C.primaryKey),
  name: C.text(),
  email: C.text().pipe(C.nullable)
})

const posts = Table.make("posts", {
  id: C.uuid().pipe(C.primaryKey),
  userId: C.uuid(),
  title: C.text().pipe(C.nullable)
})
```

Table definitions still carry schema information for table modeling. Query result rows are inferred from the query plan itself.

## Build Queries

### Select and Infer the Result Shape

```ts
const listUsers = Q.select({
  id: users.id,
  profile: {
    name: users.name,
    email: users.email
  }
}).pipe(
  Q.from(users),
  Q.where(Q.eq(users.name, "alice"))
)

type ListUsersRow = Q.ResultRow<typeof listUsers>
// {
//   id: string
//   profile: {
//     name: string
//     email: string | null
//   }
// }

const row: ListUsersRow = {
  id: "user-1",
  profile: {
    name: "alice",
    email: null
  }
}
```

The result type follows the exact projection shape, including nested objects and nullability.

### Predicate-Driven Nullability Refinement

```ts
const posts = Table.make("posts", {
  id: C.uuid().pipe(C.primaryKey),
  userId: C.uuid(),
  title: C.text().pipe(C.nullable)
})

const allPosts = Q.select({
  id: posts.id,
  title: posts.title,
  upperTitle: Q.upper(posts.title)
}).pipe(
  Q.from(posts)
)

type AllPostsRow = Q.ResultRow<typeof allPosts>
// {
//   id: string
//   title: string | null
//   upperTitle: string | null
// }

const titledPosts = Q.select({
  id: posts.id,
  title: posts.title,
  upperTitle: Q.upper(posts.title)
}).pipe(
  Q.from(posts),
  Q.where(Q.isNotNull(posts.title))
)

type TitledPostsRow = Q.ResultRow<typeof titledPosts>
// {
//   id: string
//   title: string
//   upperTitle: string
// }
```

Without refinement, `title` and `upperTitle` stay nullable. Adding `where(Q.isNotNull(posts.title))` narrows the selected column and derived expressions for the remainder of the plan.

The opposite refinement also works:

```ts
const untitledPosts = Q.select({
  title: posts.title,
  upperTitle: Q.upper(posts.title)
}).pipe(
  Q.from(posts),
  Q.where(Q.isNull(posts.title))
)

type UntitledPostsRow = Q.ResultRow<typeof untitledPosts>
// {
//   title: null
//   upperTitle: null
// }
```

Here both the selected column and the derived expression collapse all the way to `null`.

### Left Joins: Static vs Runtime Row Types

```ts
const usersWithGuaranteedPost = Q.select({
  userId: users.id,
  postId: posts.id
}).pipe(
  Q.from(users),
  Q.leftJoin(posts, Q.eq(users.id, posts.userId)),
  Q.where(Q.isNotNull(posts.id))
)

type UsersWithGuaranteedPostRow = Q.ResultRow<typeof usersWithGuaranteedPost>
// {
//   userId: string
//   postId: string
// }

type UsersWithGuaranteedPostRuntimeRow =
  Q.RuntimeResultRow<typeof usersWithGuaranteedPost>
// {
//   userId: string
//   postId: string | null
// }
```

Why the split:

- `ResultRow` reflects what the query logically guarantees after predicate implication
- `RuntimeResultRow` reflects the conservative remap-only runtime path

This is intentional. The library no longer validates database rows against query result schemas at runtime.

### Case Expressions

Searched `CASE` is available through a builder:

```ts
const normalizedTitles = Q.select({
  normalizedTitle: Q.case()
    .when(Q.isNull(posts.title), "missing")
    .else(Q.upper(posts.title))
}).pipe(
  Q.from(posts),
  Q.where(Q.isNotNull(posts.title))
)

type NormalizedTitlesRow = Q.ResultRow<typeof normalizedTitles>
// {
//   normalizedTitle: string
// }
```

The outer `where(...)` can make `CASE` branches unreachable, and the return type narrows accordingly when the implication engine can prove it.

### Aggregation and Grouping

```ts
const postsPerUser = Q.select({
  userId: users.id,
  postCount: Q.count(posts.id),
  latestTitle: Q.max(posts.title)
}).pipe(
  Q.from(users),
  Q.leftJoin(posts, Q.eq(users.id, posts.userId)),
  Q.groupBy(users.id)
)

type PostsPerUserRow = Q.ResultRow<typeof postsPerUser>
// {
//   userId: string
//   postCount: number
//   latestTitle: string | null
// }
```

Grouped queries stay type-checked:

- grouped scalar selections must be covered by `groupBy(...)`
- aggregate expressions like `count(...)`, `max(...)`, and `min(...)` remain legal
- incompatible aggregate/scalar mixes are rejected before render or execute

Example of an invalid grouped selection:

```ts
const invalidGroupedPlan = Q.select({
  userId: users.id,
  postTitle: posts.title,
  postCount: Q.count(posts.id)
}).pipe(
  Q.from(users),
  Q.leftJoin(posts, Q.eq(users.id, posts.userId)),
  Q.groupBy(users.id)
)

// `postTitle` is neither grouped nor aggregated, so this plan is not
// renderable/executable as a complete grouped query.
```

## Query Construction Safety

The builders allow partial plans while you assemble a query. The strict check happens when a plan must be complete, such as:

- `Renderer.render(...)`
- `Executor.execute(...)`
- `Q.CompletePlan<typeof plan>`

If you reference a table in `select(...)`, `where(...)`, or a join predicate, and never bring that source into scope, the complete-plan boundary fails with a readable branded type error that includes the missing source names:

```ts
const invalidMissingFrom = Q.select({
  userId: users.id
})

// not renderable or executable: `users` never appears in `from(...)`
```

```ts
const invalidMissingJoin = Q.select({
  userId: users.id,
  postTitle: posts.title
}).pipe(
  Q.from(users)
)

// not renderable or executable: `posts` is projected but never joined
```

```ts
const invalidWhereSource = Q.select({
  userId: users.id
}).pipe(
  Q.from(users),
  Q.where(Q.eq(posts.userId, users.id))
)

// not renderable or executable: the predicate references `posts` without a join
```

Valid version:

```ts
const validUsersWithPosts = Q.select({
  userId: users.id,
  postTitle: posts.title
}).pipe(
  Q.from(users),
  Q.leftJoin(posts, Q.eq(users.id, posts.userId))
)

type ValidUsersWithPostsRow = Q.ResultRow<typeof validUsersWithPosts>
// {
//   userId: string
//   postTitle: string | null
// }
```

## Rendering

```ts
import * as Postgres from "effect-qb/postgres"

const rendered = Postgres.Renderer.make().render(postsPerUser)

type RenderedRow = Postgres.Renderer.RowOf<typeof rendered>
// same logical row type as Q.ResultRow<typeof postsPerUser>

rendered.sql
rendered.params
rendered.projections
```

Rendered queries carry:

- SQL text
- ordered bind parameters
- projection metadata
- the row type as a phantom type

They do not carry a query result schema.

## Execution

```ts
import * as Effect from "effect/Effect"
import * as Postgres from "effect-qb/postgres"

const renderer = Postgres.Renderer.make()
const executor = Postgres.Executor.fromSqlClient(renderer)

const rowsEffect = executor.execute(postsPerUser)

type PostsPerUserRows = Postgres.Query.ResultRows<typeof postsPerUser>
type PostsPerUserEffect = typeof rowsEffect
// Effect.Effect<PostsPerUserRows, unknown, SqlClient.SqlClient>
```

Runtime execution is:

1. render the plan
2. execute SQL
3. remap flat projection aliases into nested objects

There is no query-result schema decode step.

If the database returns invalid values, `effect-qb` will not reject them at runtime. The expectation is that the database and your query plan agree, and the static contract is the primary safety boundary.

## Type Safety and Return Types

Key types:

- `Q.ResultRow<typeof plan>`
  - logical row type after nullability refinement, branch pruning, join promotion, and grouping checks
- `Q.ResultRows<typeof plan>`
  - `ReadonlyArray<Q.ResultRow<typeof plan>>`
- `Q.RuntimeResultRow<typeof plan>`
  - conservative remap-only row shape used to describe the schema-free runtime boundary
- `Renderer.RowOf<typeof rendered>`
  - row type attached to a rendered query

What the type system catches:

- missing `from(...)` / join sources
- predicates that reference sources not present in the plan
- dialect mismatches between plans and executors
- invalid aggregate/scalar grouped selections
- nullability changes caused by `where(...)`
- optional joined sources becoming required when predicates prove presence
- exact nested projection result shapes

Typical benefits:

- no manual row interfaces for most queries
- query return types stay local to the plan definition
- left joins start conservative and narrow when predicates justify it
- `CASE` expressions can narrow to fewer branches when earlier predicates make others impossible
- executors return the same `ResultRows<typeof plan>` type the plan implies

## Dialect Notes

- `effect-qb` exports the Postgres query DSL by default.
- Use `effect-qb/postgres` for Postgres-specific renderer/executor entrypoints.
- Use `effect-qb/mysql` for MySQL-specific query/render/execute entrypoints.
- PostgreSQL placeholder syntax uses `$1`, `$2`, ...
- MySQL placeholder syntax uses `?`
- Identifier quoting is dialect-specific.

Examples:

```ts
import * as Postgres from "effect-qb/postgres"
import * as Mysql from "effect-qb/mysql"

const postgresRenderer = Postgres.Renderer.make()
const mysqlRenderer = Mysql.Renderer.make()
```

## Unsupported Features

This release is focused on typed read-path query construction. Notable gaps:

- insert / update / delete plan builders
- DDL workflows
- `like`, `ilike`, and broader comparison operator coverage
- set operators such as `union`, `intersect`, and `except`
- CTEs
- subquery-as-source composition
- right joins, full joins, and cross joins
- window functions

See the behavior and type test suites for the exact supported surface.

## Project Layout

- `src/index.ts` - core exports
- `src/postgres.ts` - Postgres entrypoint
- `src/mysql.ts` - MySQL entrypoint
- `src/internal/` - query factories, SQL renderers, projection remapping, and type-level predicate analysis
- `test/` - behavior tests and type tests

## Contributing

Run the full suite from the repository root:

```bash
bun test
bunx tsc -p tsconfig.type-tests.json
```

The project prefers behavior-first tests and explicit type tests for static guarantees.
