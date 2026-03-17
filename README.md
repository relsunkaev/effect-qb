# effect-qb

Composable, type-safe query construction for PostgreSQL and MySQL with explicit type-level safety checks and dialect-aware execution.

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Modules](#modules)
- [Getting Started](#getting-started)
- [Define Tables](#define-tables)
- [Build Queries](#build-queries)
  - [Select](#select)
  - [Predicates and Nullability Refinement](#predicates-and-nullability-refinement)
  - [Joins](#joins)
  - [Case Expressions](#case-expressions)
  - [Aggregation and Grouping](#aggregation-and-grouping)
- [Rendering](#rendering)
- [Execution](#execution)
- [Type Safety and Guarantees](#type-safety-and-guarantees)
- [Dialect Notes](#dialect-notes)
- [Unsupported Features](#unsupported-features)
- [Project Layout](#project-layout)
- [Contributing](#contributing)

## Overview

`effect-qb` is a typed SQL query layer centered around a few primitives:

- Immutable query plans
- A shared expression/query factory with dialect-specialized variants
- A renderer that emits SQL + bind parameters
- An executor that remaps alias-keyed rows back to the query result shape

The library tracks more than SQL syntax: it tracks source usage, nullability, aggregation context, and dialect support directly in types.

## Installation

```bash
bun install
```

Current package exports:

- `.` (core abstractions + postgres defaults)
- `./postgres`
- `./mysql`

## Modules

Core entrypoint (`effect-qb`):

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

Use the dialect-specific modules when your schema and plan should be locked to one engine.

## Getting Started

### Define Tables

```ts
import { Query as Q, Table, Column as C } from "effect-qb"

const users = Table.make("users", {
  id: C.uuid().pipe(C.primaryKey),
  name: C.text(),
  email: C.text().pipe(C.nullable),
  createdAt: C.timestamp()
})
```

### Build Queries

#### Select

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
```

`ResultRow<typeof listUsers>` resolves to a nested object matching the projection shape.

## Predicates and Nullability Refinement

Predicates are not only SQL predicates; they refine source-nullability in the plan.

```ts
import { Query as Q, Table, Column as C } from "effect-qb"

const posts = Table.make("posts", {
  id: C.uuid().pipe(C.primaryKey),
  userId: C.uuid(),
  title: C.text().pipe(C.nullable)
})

const plan = Q.select({
  title: Q.coalesce(posts.title, "(untitled)")
}).pipe(
  Q.from(posts),
  Q.where(Q.isNotNull(posts.title))
)

// title is now guaranteed non-null in ResultRow<typeof plan>
type UserPostRow = Q.ResultRow<typeof plan>
```

`where(Q.isNotNull(posts.title))` narrows `posts.title` for the remainder of the plan, and nested projections reflect that constraint where possible.

#### Left join + refinement

```ts
import { Query as Q, Table, Column as C } from "effect-qb"

const users = Table.make("users", {
  id: C.uuid().pipe(C.primaryKey),
  name: C.text()
})

const posts = Table.make("posts", {
  id: C.uuid().pipe(C.primaryKey),
  userId: C.uuid(),
  title: C.text().pipe(C.nullable)
})

const q = Q.select({
  userId: users.id,
  visibleTitle: Q.case()
    .when(Q.isNotNull(posts.title), Q.upper(posts.title))
    .else("unpublished")
}).pipe(
  Q.from(users),
  Q.leftJoin(posts, Q.eq(users.id, posts.userId)),
  Q.where(Q.isNotNull(posts.title))
)
```

Here the left-join branch is still validated for presence by the `where`, and the select side is typed accordingly.

## Joins

```ts
const usersWithPosts = Q.select({
  userEmail: users.email,
  postCount: Q.count(posts.id)
}).pipe(
  Q.from(users),
  Q.leftJoin(posts, Q.eq(users.id, posts.userId))
)
```

Join sources must satisfy plan-required dependencies. Missing sources are rejected as plan errors.

## Case Expressions

Searched `CASE` is supported via builder syntax:

```ts
const normalizedStatus = Q.select({
  statusText: Q.case()
    .when(Q.isNull(users.email), "no-email")
    .when(Q.eq(users.name, "admin"), "administrator")
    .else("member")
}).pipe(Q.from(users))
```

## Aggregation and Grouping

```ts
import { Query as Q, Table, Column as C } from "effect-qb"

const postsPerUser = Q.select({
  userId: users.id,
  postsCount: Q.count(posts.id)
}).pipe(
  Q.from(users),
  Q.leftJoin(posts, Q.eq(users.id, posts.userId)),
  Q.groupBy(users.id)
)
```

## Rendering

Render a query plan to SQL and parameters for a specific engine.

```ts
import { Query as Q, Renderer, Table, Column as C } from "effect-qb"

const rendered = Renderer.make("postgres").render(listUsers)

// rendered.sql: SQL string with placeholders
// rendered.params: ordered parameter values
// rendered.projections: canonical projection metadata
```

Rendered queries carry SQL, params, and projection metadata only. Query result typing is a compile-time contract; the runtime renderer does not attach a row schema.

## Execution

```ts
import { Query as Q, Renderer, Executor, Table, Column as C } from "effect-qb"

const renderer = Renderer.make("postgres")
const executor = Executor.fromSqlClient(renderer)

const rowsEffect = executor.execute(plan)
```

`fromSqlClient` calls `sql.unsafe` and remaps the returned alias-keyed rows into the projected object shape.

For custom DB access, use `Executor.fromDriver` and provide your own `Renderer` + `Driver` function.

`Query.ResultRow<typeof plan>` is the authoritative static contract. `Query.RuntimeResultRow<typeof plan>` is the conservative runtime remap shape. If the database returns values that violate the query’s type contract, the library no longer detects that at runtime.

## Type Safety and Guarantees

`effect-qb` is designed so many runtime classes of bugs are blocked as far left as possible:

- DB identity safety: a plan built from mismatched table identities cannot compose or execute.
- Dialect safety: unsupported combinations are rejected by the plan/executor boundary.
- Source safety: required sources/aliases must be provided before execution.
- Nullability safety: where refinements and join kinds refine column nullability through the plan.
- Shape safety: nested aliases and aliases are preserved through projection remapping.
- Static result contracts: `ResultRow` captures the logical query result more tightly than the runtime remap path when predicates imply stronger guarantees.

### Typical compile-time benefits

- `where(isNotNull(column))` narrows nullable fields before they are projected where supported.
- `leftJoin` starts with nullable right-side columns and can be sharpened with `where` predicates.
- `ResultRow` / `ResultRows` types let you keep full nested return typing without manual row mappers.

## Dialect Notes

- PostgreSQL is available from `Renderer.make("postgres")` and `Postgres.*` modules.
- MySQL currently requires `Renderer.make("mysql")` and `Mysql.*` modules.
- Identifier quoting and parameter placeholders follow engine semantics.
- All core operators in `Query` are available in both dialect modules through `makeDialectQuery`.

## Unsupported Features

This release intentionally focuses on query construction and read-path correctness. Features below are either not implemented or not broadly exposed yet:

- Insert/update/delete plan builders
- Mutations and DDL workflows
- `like`, `ilike`, and other advanced predicates beyond current expression coverage
- Set operators (`union`, `intersect`, `except`) and CTEs
- Subquery-as-source composition
- Right/full joins and cross joins

See current behavior and tests in the repository for the exact implemented operator coverage.

## Project Layout

- `src/index.ts` - shared/portable query entrypoint
- `src/postgres.ts` - PostgreSQL-specific exports
- `src/mysql.ts` - MySQL-specific exports
- `src/internal/` - factories, schema derivation, SQL rendering, and nullability logic
- `test/` - behavior tests and type tests

## Contributing

Run tests from project root:

```bash
bun test
bunx tsc -p tsconfig.type-tests.json
```

Use this repository with explicit, behavior-first query construction: build plans with `Query`, render once, then execute through a renderer + executor pair.
