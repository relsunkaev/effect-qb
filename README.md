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
  - [Exists Subqueries](#exists-subqueries)
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

### Exists Subqueries

`exists(...)` accepts an aggregation-safe nested plan and returns a non-null boolean expression:

```ts
const postsByAlice = Q.select({
  id: posts.id
}).pipe(
  Q.from(posts),
  Q.where(Q.eq(posts.userId, users.id))
)

const usersWithPostsByAlice = Q.select({
  userId: users.id,
  hasPosts: Q.exists(postsByAlice)
}).pipe(
  Q.from(users)
)

type UsersWithPostsByAliceRow = Q.ResultRow<typeof usersWithPostsByAlice>
// {
//   userId: string
//   hasPosts: boolean
// }
```

Correlated nested plans stay dialect-checked, bubble their outer-source requirements up to the enclosing query, and share the outer render state's parameter ordering.

If the outer query never brings the referenced source into scope, the complete-plan boundary still fails with the usual missing-source diagnostic.

### Derived Tables

Subqueries can also be used as sources, but they must be aliased first with `Q.as(...)`:

```ts
const activePosts = Q.select({
  userId: posts.userId,
  title: posts.title
}).pipe(
  Q.from(posts),
  Q.where(Q.isNotNull(posts.title))
)

const activePostsSource = Q.as(activePosts, "active_posts")

const usersWithActivePosts = Q.select({
  userId: users.id,
  title: activePostsSource.title
}).pipe(
  Q.from(users),
  Q.innerJoin(activePostsSource, Q.eq(users.id, activePostsSource.userId))
)

type UsersWithActivePostsRow = Q.ResultRow<typeof usersWithActivePosts>
// {
//   userId: string
//   title: string
// }
```

Passing a raw subquery directly to `from(...)` or a join is rejected at the type boundary. The compiler points you to `Q.as(subquery, alias)` so the derived source has an explicit SQL alias and a stable nested output shape.

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

type InvalidGroupedPlan = Q.CompletePlan<typeof invalidGroupedPlan>
// carries:
// {
//   __effect_qb_error__: "effect-qb: invalid grouped selection"
//   __effect_qb_hint__:
//     "Scalar selections must be covered by groupBy(...) when aggregates are present"
// }
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

type InvalidMissingFrom = Q.CompletePlan<typeof invalidMissingFrom>
// carries:
// {
//   __effect_qb_error__:
//     "effect-qb: query references sources that are not yet in scope"
//   __effect_qb_missing_sources__: "users"
//   __effect_qb_hint__:
//     "Add from(...) or a join for each referenced source before render or execute"
// }
```

```ts
const invalidMissingJoin = Q.select({
  userId: users.id,
  postTitle: posts.title
}).pipe(
  Q.from(users)
)

type InvalidMissingJoin = Q.CompletePlan<typeof invalidMissingJoin>
// carries the same branded error shape, with
// __effect_qb_missing_sources__: "posts"
```

```ts
const invalidWhereSource = Q.select({
  userId: users.id
}).pipe(
  Q.from(users),
  Q.where(Q.eq(posts.userId, users.id))
)

type InvalidWhereSource = Q.CompletePlan<typeof invalidWhereSource>
// carries the same branded error shape, with
// __effect_qb_missing_sources__: "posts"
```

Dialect mismatches are also branded:

```ts
import * as Mysql from "effect-qb/mysql"
import * as Postgres from "effect-qb/postgres"

const mysqlUsers = Mysql.Table.make("users", {
  id: Mysql.Column.uuid().pipe(Mysql.Column.primaryKey)
})

const mysqlPlan = Mysql.Query.select({
  id: mysqlUsers.id
}).pipe(
  Mysql.Query.from(mysqlUsers)
)

type MysqlAgainstPostgres =
  Postgres.Query.DialectCompatiblePlan<typeof mysqlPlan, "postgres">
// carries:
// {
//   __effect_qb_error__:
//     "effect-qb: plan dialect is not compatible with the target renderer or executor"
//   __effect_qb_plan_dialect__: "mysql"
//   __effect_qb_target_dialect__: "postgres"
//   __effect_qb_hint__:
//     "Use the matching dialect module or renderer/executor"
// }
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
type PostsPerUserError = Postgres.Executor.PostgresQueryError<typeof postsPerUser>
type PostsPerUserEffect = typeof rowsEffect
// Effect.Effect<
//   PostsPerUserRows,
//   PostsPerUserError,
//   SqlClient.SqlClient
// >
```

Runtime execution is:

1. render the plan
2. execute SQL
3. remap flat projection aliases into nested objects

There is no query-result schema decode step.

If the database returns invalid values, `effect-qb` will not reject them at runtime. The expectation is that the database and your query plan agree, and the static contract is the primary safety boundary.

Dialect executors are also query-sensitive:

- `Postgres.Executor.PostgresQueryError<typeof plan>`
- `Mysql.Executor.MysqlQueryError<typeof plan>`

For the current read-only query plans, those error types remove known write-required failures from the direct error union. If a driver still returns one of those impossible errors, it is wrapped in `@postgres/unknown/query-requirements` or `@mysql/unknown/query-requirements` with the original normalized dialect error preserved under `cause`.

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
- `Q.CapabilitiesOfPlan<typeof plan>`
  - capability set carried by the plan; current read queries resolve to `"read"`
- `Q.MergeCapabilities<A, B>` / `Q.MergeCapabilityTuple<[...]>`
  - helper types for composing capability sets in nested-plan features
- `Postgres.Executor.PostgresQueryError<typeof plan>` / `Mysql.Executor.MysqlQueryError<typeof plan>`
  - dialect error union narrowed by the plan's capabilities

What the type system catches:

- missing `from(...)` / join sources
- predicates that reference sources not present in the plan
- dialect mismatches between plans and executors
- invalid aggregate/scalar grouped selections
- nullability changes caused by `where(...)`
- optional joined sources becoming required when predicates prove presence
- exact nested projection result shapes
- impossible write-only dialect errors removed from read-query executor error channels

Typical benefits:

- no manual row interfaces for most queries
- query return types stay local to the plan definition
- left joins start conservative and narrow when predicates justify it
- `CASE` expressions can narrow to fewer branches when earlier predicates make others impossible
- `exists(subquery)` requires a complete nested plan and returns a non-null boolean
- `as(subquery, alias)` makes derived tables explicit and keeps subquery output paths typed
- read predicates include equality, inequality, range checks, pattern matches, and membership tests
- executors return the same `ResultRows<typeof plan>` type the plan implies
- dialect executors expose a tighter error channel than the raw dialect catalog when the query shape rules out certain failures

Capability composition helpers are also exported for future nested-plan features:

```ts
type Capability = Q.CapabilitiesOfPlan<typeof postsPerUser>
// "read"

type FutureNestedCapability = Q.MergeCapabilities<"read", "write">
// "read" | "write"

const combined = Q.union_query_capabilities(["read"], ["write", "read"])
// ["read", "write"]
```

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
- set operators such as `union`, `intersect`, and `except`
- CTEs
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
