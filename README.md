# effect-qb

Build typed SQL queries for PostgreSQL, MySQL, and SQLite with Effect.

Define tables with Effect Schemas, compose query plans as values, then render
SQL or execute it through an Effect SQL client. Result rows are inferred from
your selection and checked when decoded. This is a query builder, not an ORM:
you choose the joins, predicates, transaction boundaries, and database client.

## Contents

| I want to… | Start here |
| --- | --- |
| Run a query against a database | [Quick Start](#quick-start) |
| Define columns, constraints, and codecs | [Core Concepts](#core-concepts) |
| Filter, join, group, or compose queries | [Writing Queries](#writing-queries) |
| Execute, stream, or require one result | [Executing Queries](#executing-queries) |
| Work with stored JSON and reusable paths | [JSON and JSONB Paths](#json-and-jsonb-paths) |
| Reuse a base query or paginate it | [Recipes](#recipes) |
| Understand what TypeScript proves | [Type Safety](#type-safety) |
| Choose portable or database-specific APIs | [Dialects](#dialects) |
| Find an export or contribute | [API Map](#api-map) · [Development](#development) |

For driver guides, contracts, and maintainer notes, use the
[documentation index](docs/README.md).

## Getting Started

### Install

```sh
bun add effect-qb effect
```

Runtime requirements:

- Node.js `>=22` and stable Effect `^4.0.0`
- Bun `>=1.3.5` for this repository's development scripts

Public query-builder import paths:

- `effect-qb` - portable table, column, table-option, query, function, renderer, and casing modules
- `effect-qb/postgres` - Postgres column extensions, option modifiers, renderer, executor, schema helpers
- `effect-qb/mysql` - MySQL extensions, renderer, executor
- `effect-qb/sqlite` - SQLite extensions, renderer, executor

### Quick Start

This example creates an **in-memory SQLite database**, inserts two users, and
reads the active user. It needs no server or credentials. The table and query
use portable APIs; the executor and SQL client select the database.

Install the client alongside the query builder:

```sh
bun add effect-qb effect @effect/sql-sqlite-node
```

Use Node.js **22.16 or newer** for this client. Save the following as
`quick-start.ts` and build it with your usual TypeScript bundler for Node.js
(for example, esbuild). The published packages do not need a runtime TS loader.

`Table.make` describes a table; it does not create one. `Query.createTable`
builds the DDL plan. The program below executes that plan, inserts Ada and Grace,
then reads only Ada because Grace is inactive.

```ts
import { SqliteClient } from "@effect/sql-sqlite-node"
import * as Effect from "effect/Effect"
import { Column, Query, Table } from "effect-qb"
import { Executor } from "effect-qb/sqlite"

// Describe the table.
const users = Table.make("users", {
  id: Column.text().pipe(Column.primaryKey),
  email: Column.text(),
  active: Column.boolean()
})
// Build the query; no SQL has run yet.
const activeUsers = Query.select({ id: users.id, email: users.email }).pipe(
  Query.from(users),
  Query.where(Query.eq(users.active, true)),
  Query.orderBy(users.id)
)
type ActiveUser = Query.ResultRow<typeof activeUsers>
// { readonly id: string; readonly email: string }

// Create, seed, and read through the SQLite executor.
const executor = Executor.make()
const program = executor.execute(Query.createTable(users)).pipe(
  Effect.andThen(executor.execute(Query.insert(users,
    { id: "ada", email: "ada@example.com", active: true }
  ))),
  Effect.andThen(executor.execute(Query.insert(users,
    { id: "grace", email: "grace@example.com", active: false }
  ))),
  Effect.andThen(executor.execute(activeUsers)),
  Effect.provide(SqliteClient.layer({ filename: ":memory:" }))
)
const rows = await Effect.runPromise(program)
console.log(rows)
// [{ id: "ada", email: "ada@example.com" }]
```

For example, build with esbuild and run the resulting JavaScript under Node:

```sh
bunx esbuild quick-start.ts \
  --bundle --platform=node --format=esm \
  --packages=external --outfile=quick-start.mjs
node quick-start.mjs
```

`executor.execute` returns an Effect. The client layer supplies the connection;
`Effect.runPromise` runs the program and closes its scoped
resources. In an existing Effect application, reuse its SQL client layer rather
than creating a connection for each query.

To inspect SQL without connecting, call a dialect renderer's `render(plan)`.
The same portable plan can be [rendered for all three databases](#portable-standard-surface).
See [SQLite on Node.js](docs/sqlite-node.md) for driver and streaming limits.

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

## Query Lifecycle

### Writing Queries

Queries are ordinary values. Compose them with `.pipe(...)`.

```ts
import { Column, Function, Query, Table } from "effect-qb"
import * as Pg from "effect-qb/postgres"

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
  Query.having(Query.gt(Function.count(posts.id), 1)),
  Query.orderBy(users.email)
)

type PostsByUserRow = Query.ResultRow<typeof postsByUser>
// {
//   readonly userId: string
//   readonly email: string
//   readonly postCount: Scalar.BigIntString
// }

```

This returns authors with more than one published post. `where` filters input
rows **before** grouping; `having` filters the groups **after** aggregation.
`count` follows SQL counting semantics: `count(column)` ignores NULL values.
Its portable result uses `Scalar.BigIntString`, a canonical integer string,
rather than assuming a JavaScript number is precise enough.

Core query surfaces include:

- `select`, `from`, joins, aliases, derived sources, and CTEs
- predicates such as `eq`, `and`, `or`, `isNull`, `isNotNull`, `exists`
- grouping, ordering, distinct, limit, and offset
- inserts, updates, deletes, merge, upsert, and returning where supported
- set operators
- transaction helpers such as savepoints

Choose the SQL operation you need:

- **Filter and label:** [predicates](#predicate-combinators), [CASE/MATCH](#conditional-expressions).
- **Summarize and rank:** [aggregates](#functions-and-aggregates), [windows](#window-functions).
- **Compose sources:** [CTEs](#common-table-expressions), [correlated subqueries](#correlated-subqueries), [set operators](#set-operators).
- **Write safely:** [mutations](#mutations), [transactions](#transactions-and-savepoints), [DDL](#ddl).
- **Extend SQL:** [arithmetic](#arithmetic-and-composition), [native division](#native-division-and-rounding), [typed fragments](#typed-sql-fragments).

The examples below build plans; they do not run SQL unless they explicitly call
an executor. Use the client setup in [Quick Start](#quick-start) to execute them.
Repeated `where` calls add conditions with AND. An UPDATE or DELETE without a
`where` affects every row; add the predicate before executing a mutation.

#### Predicate Combinators

Combine predicates with `and`/`or`; `between`, `in`, `notIn`, `isNull`, and
`isNotNull` cover the common shapes.

<details>
<summary>Show example</summary>

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

#### Conditional Expressions

Use `case` for different predicates, or `match` to compare one expression with
several alternatives. Both produce SQL CASE expressions, not JavaScript branches.

<details>
<summary>Show example</summary>

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

#### Functions and Aggregates

Root `Function` contains the portable subset: arithmetic, `concat`, `coalesce`,
`count`, `min`/`max`, and portable windows. Each dialect owns native
`lower`/`upper`, `sum`/`avg`, clock functions, `round`, `modulo`, and explicitly
framed window value functions.
`count`, `rowNumber`, `rank`, and `denseRank` decode to
`Scalar.BigIntString` so 64-bit results have one portable runtime contract.

<details>
<summary>Show example</summary>

```ts
import { Column, Function, Query, Table } from "effect-qb"
import * as Pg from "effect-qb/postgres"

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
  label: Function.concat(Pg.Function.lower(users.email), "-user"),
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

#### Arithmetic and Composition

Arithmetic expressions keep the input column's numeric contract. `andAll` and
`orAll` accept arrays assembled at runtime; their empty-list identities are
`true` and `false`. `when` conditionally applies a pipe modifier, while
`includeIf` builds an optional selection fragment.

<details>
<summary>Show example</summary>

```ts
import { Column, Function, Query, Table } from "effect-qb"

const accounts = Table.make("accounts", {
  id: Column.int().pipe(Column.primaryKey),
  balance: Column.real(),
  active: Column.boolean()
})

const minimum = 100
const onlyActive = true as boolean

const report = Query.select({
  id: accounts.id,
  adjustedBalance: Function.abs(Function.add(accounts.balance, 2.5)),
  ...Query.includeIf(onlyActive, { active: accounts.active })
}).pipe(
  Query.from(accounts),
  Query.where(Query.andAll([
    Query.gte(accounts.balance, minimum),
    ...(onlyActive ? [Query.eq(accounts.active, true)] : [])
  ]))
)
```

</details>

#### Native Division and Rounding

`divide`, `round` and `modulo` live on each dialect's `Function` module because their
accepted database types, result types, and runtime behavior are not portable.
`Cast.to(...)` can deliberately select an overload; the operation still belongs
to the dialect that defines its semantics.

<details>
<summary>Show example</summary>

```ts
import { Cast, Column, Query, Table, Type } from "effect-qb"
import * as My from "effect-qb/mysql"
import * as Pg from "effect-qb/postgres"
import * as Sq from "effect-qb/sqlite"

const amounts = Table.make("amounts", {
  count: Column.int(),
  exact: Column.number({ precision: 12, scale: 2 }),
  value: Column.real()
})

const postgresExact = Cast.to(amounts.value, Type.numeric())

const postgresPlan = Query.select({
  quotient: Pg.Function.divide(amounts.count, Cast.to(2, Pg.Type.int4())),
  remainder: Pg.Function.modulo(amounts.count, 2),
  rounded: Pg.Function.round(postgresExact, 2)
}).pipe(Query.from(amounts))

const mysqlPlan = Query.select({
  quotient: My.Function.divide(amounts.exact, amounts.count),
  remainder: My.Function.modulo(amounts.exact, amounts.count),
  rounded: My.Function.round(amounts.exact, 2)
}).pipe(Query.from(amounts))

const sqlitePlan = Query.select({
  quotient: Sq.Function.divide(amounts.value, amounts.count),
  remainder: Sq.Function.modulo(amounts.value, amounts.count),
  rounded: Sq.Function.round(amounts.exact, 2)
}).pipe(Query.from(amounts))
```

| Dialect | `modulo` | `round` |
| --- | --- | --- |
| PostgreSQL | integer and `numeric`; floating operands are rejected; zero divisors fail the statement | `numeric` is exact and rounds ties away from zero; integer/float one-argument forms return `float8` with platform-dependent floating-point ties |
| MySQL | integer → `BIGINT`, exact → `DECIMAL`, approximate → `DOUBLE`; zero divisors return `NULL` | preserves the input category; exact ties round away from zero while approximate rounding follows floating-point semantics |
| SQLite | operands are integer-coerced; a potentially REAL result is typed as `double`; zero divisors return `NULL` | always returns floating-point `double`; negative scales behave as zero and binary representation can affect decimal ties |

Division uses native `/`, without casts or zero guards added to expression
operands. PostgreSQL integer pairs truncate (bigint returns BigIntString);
exact pairs return DecimalString. A float operand promotes to float8 except
float4/float4, which stays float4. Zero denominators fail. MySQL exact pairs
return DecimalString, approximate pairs return number, and zero denominators
return NULL in SELECT (DML depends on SQL mode). SQLite always exposes number
results: integer values truncate, REAL values divide fractionally, and integer
overflow can promote to REAL. MySQL decimal results are normalized by the
executor; trailing scale is not preserved.

JavaScript number literals use the dialect numeric literal mapping: float8 for
PostgreSQL, double for MySQL, and native bound numbers for SQLite. Use explicit
integer or REAL casts when selecting truncating or fractional division matters.

All three dialects give a nonzero remainder the dividend's sign. Scale-sensitive
exact casts are still dialect-specific: in particular, MySQL's bare
`CAST(... AS DECIMAL)` defaults to scale zero, so prefer a typed decimal column
or expression when fractional precision must survive before `round`.

</details>

#### Typed SQL Fragments

`Fragment.expression` is the escape hatch for a database feature that does not
yet have a first-class helper. Static template text is trusted source text.
Interpolations accept typed expressions or `Fragment.identifier(...)`;
runtime values must go through `Query.literal(...)`, so they remain bound
parameters.

<details>
<summary>Show example</summary>

```ts
import * as Schema from "effect/Schema"
import { Column, Fragment, Query, Table, Type } from "effect-qb"

const users = Table.make("users", {
  id: Column.int().pipe(Column.primaryKey),
  email: Column.text()
})

const normalizedEmail = Fragment.expression({
  dbType: Type.text(),
  schema: Schema.String,
  nullability: "never"
})`coalesce(${users.email}, ${Query.literal("missing")})`

const plan = Query.select({
  normalizedEmail
}).pipe(Query.from(users))
```

</details>

#### Common Table Expressions

Pipe `Query.with(name)` onto a complete plan to name it, then reference it like
any other source. `Query.withRecursive(name)` builds recursive CTEs.

<details>
<summary>Show example</summary>

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

#### Correlated Subqueries

A subquery correlates with the outer query by referencing its columns.
`Query.exists`, `Query.inSubquery`, `Query.scalar`, `Query.compareAny`, and
`Query.compareAll` all take a select plan.

<details>
<summary>Show example</summary>

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

#### Set Operators

`union`, `unionAll`, `intersect`, `intersectAll`, `except`, and `exceptAll`
combine two source-complete selects that share a projection shape — useful for
stitching together independent queries. The minimal example below splits one
table by a flag so the two shapes are obviously identical.

<details>
<summary>Show example</summary>

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

#### Window Functions

`Function.rowNumber`, `rank`, and `denseRank` take a window spec;
`Function.over` wraps an aggregate in a window without an explicit frame.
`lag` and `lead` read another row in an ordered partition. Root `firstValue`
and `lastValue` use the portable default frame. Explicit frames belong to each
dialect's `Function.over`, `firstValue`, and `lastValue` helpers because frame
boundary clipping differs across engines.

<details>
<summary>Show example</summary>

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
  }),
  previousPost: Function.lag(posts.id, {
    spec: {
      partitionBy: [posts.userId],
      orderBy: [{ value: posts.id, direction: "asc" }]
    }
  }),
  firstPost: Function.firstValue(posts.id, {
    partitionBy: [posts.userId],
    orderBy: [{ value: posts.id, direction: "asc" }]
  })
}).pipe(Query.from(posts))
```

</details>

#### Merge

<details>
<summary>Show example</summary>

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

#### Transactions and Savepoints

Prefer `Executor.withTransaction` for scoped transaction composition. A nested
`withTransaction` call uses the underlying transaction implementation's
savepoint behavior.

<details>
<summary>Show example</summary>

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

const writeAuditLog = executor.execute(updateAuditLog).pipe(Pg.Executor.withTransaction)
const writeMembership = executor.execute(insertMembership).pipe(
  Effect.andThen(writeAuditLog), // nested transaction uses a savepoint
  Effect.andThen(executor.execute(readMembership)),
  Pg.Executor.withTransaction
)
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

#### DDL

Build table and index statements from the same model used by queries. Execute
them explicitly; defining a model does not change the database.

<details>
<summary>Show example</summary>

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

#### Mutations

Insert payloads or update selected fields. Filter updates and deletes before
execution to avoid changing every row.

<details>
<summary>Show example</summary>

```ts
import { Column, Query, Table } from "effect-qb"

const users = Table.make("users", {
  id: Column.uuid().pipe(Column.primaryKey),
  email: Column.text(),
  visits: Column.int()
})

const insertUser = Query.insert(users, {
  id: "11111111-1111-4111-8111-111111111111",
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

// Adapt a custom driver's native bigint values to canonical integer strings.
// The column schema still determines the decoded result type.
const bigintAsString: Scalar.DriverValueMapping = {
  fromDriver: (value) => typeof value === "bigint" ? value.toString() : value,
  toDriver: (value) => value
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

A concrete executor returns **Effects**, not rows that have already been read.
Its default driver requires the ambient `effect/sql` `SqlClient` service.
Provide your application's client layer, as in [Quick Start](#quick-start),
then run the Effect. See the [JSON transport contract](docs/json-transport.md)
for driver representations.

```ts
import { Column, Query, Table } from "effect-qb"
import * as Pg from "effect-qb/postgres"

const users = Table.make("users", {
  id: Column.text().pipe(Column.primaryKey),
  email: Column.text()
})
const readUsers = Query.select({ id: users.id, email: users.email }).pipe(Query.from(users))
const findAda = readUsers.pipe(Query.where(Query.eq(users.id, "ada")))
const executor = Pg.Executor.make()

const rowsEffect = executor.execute(readUsers)
const userEffect = executor.execute(findAda).pipe(Pg.Executor.exactlyOne)
const optionalUserEffect = executor.execute(findAda).pipe(Pg.Executor.atMostOne)
const rowStream = executor.stream(readUsers)
```

| Operation | What the caller receives when run |
| --- | --- |
| `execute(plan)` | A readonly array, including an empty array for no matches |
| `execute(plan).pipe(Executor.atMostOne)` | `Option<Row>`; fails if more than one row matches |
| `execute(plan).pipe(Executor.exactlyOne)` | One row; fails on zero or multiple matches |
| `execute(plan).pipe(Executor.nonEmpty)` | A nonempty readonly array; fails on no matches |
| `executeResult(plan)` | Rows plus `affectedRows` / `insertId` when the driver provides them |
| `stream(plan)` | A Stream of rows; some drivers buffer the database result |

Cardinality helpers fail with `ResultCardinalityError`. They **do not add
LIMIT** or silently pick the first row. Use `Effect.asVoid` when the caller
intentionally ignores the returned rows.

<details>
<summary>Prepared reads, result metadata, and EXPLAIN</summary>

`prepare(plan)` caches the rendered query for this executor. Native prepared
statements remain the SQL driver's responsibility. `explain` executes a
dialect-correct EXPLAIN for read plans, so it also needs a client.

```ts
const prepared = executor.prepare(readUsers)
const firstRun = prepared.execute
const secondRun = prepared.execute
const preparedUser = executor.prepare(findAda).execute.pipe(Pg.Executor.exactlyOne)
const resultEffect = executor.executeResult(readUsers)
const queryPlanEffect = executor.explain(readUsers, { format: "json" })
```

</details>

#### Decode Errors

A successful SQL statement can still fail while normalizing or decoding a row.
`RowDecodeError` identifies the dialect, failure stage, and projection path.
Log its formatted summary rather than the error object:

```ts
import * as Effect from "effect/Effect"
import { Column, Query, Table } from "effect-qb"
import * as Pg from "effect-qb/postgres"

const users = Table.make("users", { email: Column.text() })
const readUsers = Query.select({ email: users.email }).pipe(Query.from(users))
const reportDecodeError = (error: Pg.Executor.RowDecodeError) =>
  Effect.logError(Pg.Executor.formatRowDecodeError(error))

const checkedRead = Pg.Executor.make().execute(readUsers).pipe(
  Effect.tapErrorTag("RowDecodeError", reportDecodeError)
)
```

This logs the decode failure and leaves it in the Effect's error channel.
The formatter omits row values, SQL, parameters, causes, and custom schema
messages, but **projection identifiers are not redacted**. The original error
still holds raw data: logging it directly is not safe for shared logs.
`reportInput: true` is an explicit local-debugging option, not a production
logging default.

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
  executeResult: () => Effect.succeed({
    rows: [],
    affectedRows: 1
  }),
  stream: () => Stream.empty
})

const executor = Pg.Executor.make({ driver })

```

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

Optional mutation fields may be omitted, but an explicitly supplied `undefined`
is rejected by the derived schema. Use `null` only for nullable columns. Omit a
field to use its insert default or leave it unchanged in an update.

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
import * as Pg from "effect-qb/postgres"

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
  upperTitle: Pg.Function.upper(posts.title)
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

A JSON column carries its Effect Schema **encoded** shape through property-path
access. Paths address stored keys and return stored values, not decoded leaves.
For example, a NumberFromString field is a string when selected through a JSON
path. Whole-column selection still decodes the complete document with its codec.
Schema.encodeKeys changes the keys available to paths, not the decoded row keys.
Use root `Json` for portable `Column.json(...)` columns and `Pg.Jsonb` for
Postgres `jsonb` columns; the path shape is identical.

JSON mutations and JSON constructors return stored values too. Shape-changing
expressions remain selectable; INSERT/UPDATE checks SQL expression assignments
against the destination encoded shape. Plain JavaScript document inputs still
use the decoded column shape and are encoded on write.

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
const count = Cast.to(docs.payload.profile.metrics.count.pipe(Jsonb.text), Pg.Type.float8())

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

#### Reusable JSON Focuses

For repeated mutations, build a reusable focus instead of repeating a callback
from the document root. Property paths such as
`docs.payload.someArray[2].someField` remain available.

```ts
import * as Schema from "effect/Schema"
import { Column, Query, Table } from "effect-qb"
import { Column as PgColumn, Jsonb } from "effect-qb/postgres"

const documents = Table.make("documents", {
  id: Column.int().pipe(Column.primaryKey),
  payload: PgColumn.jsonb(Schema.Struct({
    profile: Schema.Struct({ city: Schema.String, postcode: Schema.String })
  }))
})
const profile = Jsonb.focus().key("profile")
const city = profile.key("city")
const postcode = profile.key("postcode")

const updated = documents.payload.pipe(
  Jsonb.replace(city, "Paris"),
  Jsonb.replace(postcode, "75001")
)
Query.update(documents, { payload: updated })

const reshaped = documents.payload.pipe(Jsonb.replace(city, 123))
Query.select({ payload: reshaped }).pipe(Query.from(documents))
Query.update(documents, {
  // @ts-expect-error SELECT may change shape; this column still requires a string city
  payload: reshaped
})
```

A focus stores only key/index segments, not a document or its original field
types. Extending one leaves it reusable for other sibling paths. Each
`replace` operates on the previous expression and returns the whole document;
the renderer nests the mutations into one SQL expression. Empty focuses are
not replacement targets.

Root `Json.focus` / `Json.replace` wrap the existing `Json.set` semantics;
`Jsonb.replace` requires a PostgreSQL JSONB expression. These are database
operations, not JavaScript optics applied after fetching rows. A final missing
object key is created by default. Pass `{ createMissing: false }` to update
only existing paths. Null intermediate containers remain null; optional parents
remain optional in the result type.

Reading an optional parent, a record key, or an unconstrained array index can
return SQL `NULL`, represented by `null` in the result type. This also applies
to literal record keys: a string index signature does not guarantee presence.
With `noUncheckedIndexedAccess`, TypeScript additionally marks property-style
record and array expression lookups as possibly `undefined`; use `Json.key` /
`Json.index` (or their `Jsonb` equivalents) to construct those paths explicitly.

Use existing parent containers and in-range indexes for consistent results
across engines. PostgreSQL and MySQL leave a missing intermediate object
unchanged, whereas SQLite can create it. Array indexes replace rather than
insert; negative and out-of-range indexes retain the selected engine's
`set` behavior. No JavaScript read-modify-write or parent creation is added.

**Merge/concat caveat:** these existing helpers inherit different native behavior
for nested objects, arrays, and NULL across the three engines. Do not treat
`Json.merge` or `Json.concat` as an identical cross-dialect deep merge. Use
explicit path replacements when those semantics matter.

### Casting and Type Comparison

`Cast.to` converts an expression to another type and checks the conversion at
compile time. Comparisons read the same type-family metadata, so a cast is also
how you bridge two values that belong to different families.

```ts
import { Cast, Column, Query, Table, Type } from "effect-qb"

const events = Table.make("events", {
  id: Column.uuid().pipe(Column.primaryKey),
  externalRef: Column.text()
})

// id (uuid) and externalRef (text) are different comparison families, so cast
// one side to compare them.
const idAsText = events.id.pipe(Cast.to(Type.text()))
const sameRef = Query.eq(idAsText, events.externalRef)

// @ts-expect-error uuid and text are different comparison families
Query.eq(events.id, events.externalRef)
```

Portable target types come from `Type` (such as `Type.text()`);
dialect-specific targets come from the dialect module (such as
`Pg.Type.float8()`). `Type` does not expose dialect types, and dialect
modules do not re-expose portable ones, so each rejects the other's witnesses.
A compatible cast or comparison resolves before any SQL is rendered; an
incompatible one fails at compile time.

`Type.numeric()` and `Type.decimal()` request an unqualified native cast, not
portable decimal precision. Both decode to `DecimalString`, but that shared
output type does not guarantee value preservation:

| Engine | Casting `2.675` to numeric/decimal |
| --- | --- |
| PostgreSQL | Unqualified NUMERIC preserves `2.675` |
| MySQL | Unqualified DECIMAL defaults to scale zero and returns `3` |
| SQLite | NUMERIC affinity returns `2.675` here, without an exact-decimal guarantee |

Cast witnesses take no precision/scale options. `Column.number({ precision,
scale })` configures column DDL, not expression casts. For an engine-specific
precision cast, use a typed SQL fragment; applying `round` afterward cannot
recover digits already lost by the cast.

Cast checks target PostgreSQL 16.x and MySQL 8.4.x; SQLite qualification is
driver-specific. A column type is not necessarily a legal CAST target.
See the [coercion contract](docs/dialect-coercion-contract.md) for rejected pairs,
migration options, configuration assumptions, and runtime limits.

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

## Dialects

### Portable Standard Surface

Start with root `effect-qb` modules for portable plans. Choose a concrete
renderer/executor at the boundary, and a dialect helper when SQL behavior is
specific to that engine. Concrete dialects cannot be mixed in one plan.

<details>
<summary>Render one portable plan for all three databases</summary>

```ts
import { Column, Query, Table } from "effect-qb"
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
  email: users.email,
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

const mysql = My.Renderer.make().render(activeUsers)

const sqlite = Sq.Renderer.make().render(activeUsers)
// postgres.params, mysql.params, and sqlite.params are [true].
```

The result contains `sql` and `params`; rendering does not connect to a
database. PostgreSQL uses `$1` placeholders, while MySQL and SQLite use `?`.
Physical identifier quoting also follows the chosen dialect.

</details>

Native aggregate results follow each database:

| Input | PostgreSQL `sum` / `avg` | MySQL `sum` / `avg` | SQLite `sum` / `avg` |
| --- | --- | --- | --- |
| integer | `BigIntString` or `DecimalString` / `DecimalString` | `DecimalString` / `DecimalString` | `number` or `BigIntString` / `number` |
| exact decimal | `DecimalString` / `DecimalString` | `DecimalString` / `DecimalString` | `number` / `number` |
| approximate | `number` / `number` | `number` / `number` | `number` / `number` |

Dialect modules expose:

| Module | Adds |
| --- | --- |
| `effect-qb/postgres` | Postgres aggregates, case conversion, clock functions, `divide`/`round`/`modulo`, function calls and explicit window frames including `groups`, column extensions, option modifiers, JSON/jsonb helpers, type witnesses, schemas, enums, sequences, renderer, executor |
| `effect-qb/mysql` | MySQL aggregates, case conversion, clock functions, `divide`/`round`/`modulo`, function calls and explicit `rows`/`range` window frames, column extensions, JSON helpers, type witnesses, renderer, executor |
| `effect-qb/sqlite` | SQLite aggregates, case conversion, clock functions, `divide`/`round`/`modulo`, function calls and explicit window frames including `groups`, column extensions, JSON helpers, type witnesses, renderer, executor |

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

Most recipes build plans for your application's SQL client; they do not seed or
query a database on their own. Recipes marked **Runs on SQLite** include an
in-memory client, setup, and execution. Use the [Quick Start](#quick-start)
installation and build steps to run those modules under Node.js.

- [Branch a reusable query](#branch-a-reusable-query) without losing its filters.
- [Group in a CTE](#group-in-a-cte) and join its aggregate result.
- Choose [offset](#offset-pagination) or [cursor](#cursor-pagination) pagination.
- [Update stored JSON](#update-stored-json) while keeping codec boundaries explicit.
- [Upsert and return a row](#postgres-upsert-returning-a-row) in Postgres.
- [Map model names to physical SQL](#camelcase-models-snake_case-sql).

### Branch a Reusable Query

A plan is an immutable value. Build the common filters once, then extend it
for different callers. Each branch below keeps the active-user and correlated
post checks; an additional `where` adds another AND condition, not a replacement.

```ts
import { Column, Query, Table } from "effect-qb"

const users = Table.make("users", {
  id: Column.text().pipe(Column.primaryKey),
  email: Column.text(),
  active: Column.boolean(),
  visits: Column.int()
})
const posts = Table.make("posts", {
  id: Column.text().pipe(Column.primaryKey),
  userId: Column.text()
})
const userPosts = Query.select({ id: posts.id }).pipe(
  Query.from(posts),
  Query.where(Query.eq(posts.userId, users.id))
)
const base = Query.select({ id: users.id, email: users.email }).pipe(
  Query.from(users),
  Query.where(Query.eq(users.active, true)),
  Query.where(Query.exists(userPosts))
)
const firstPage = base.pipe(Query.orderBy(users.id), Query.limit(20))
const frequentAuthors = base.pipe(
  Query.where(Query.gte(users.visits, 3)),
  Query.orderBy(users.id)
)
// base is unchanged; neither branch needs to rebuild the correlated subquery.
```

The inner query supplies `posts`; the outer query supplies `users`. Its
`exists` expression checks for a matching post without multiplying user rows
as a join might.

### Group in a CTE

**Builds a plan.** Find authors with at least two published posts. Execute the
outer `authors` plan; the CTE is part of that query, not a separate database call.

For example, given these post totals:

| Author | Published posts | Draft posts | Included? |
| --- | --- | --- | --- |
| Ada (`ada@example.com`) | 2 | 1 | Yes, with count `"2"` |
| Grace (`grace@example.com`) | 1 | 0 | No |

Use `where` to choose the input rows, `groupBy` to define the groups, then
`having` to choose the aggregate results. Naming that complete plan with
`with` makes it a source for the next query.

```ts
import { Column, Function, Query, Table } from "effect-qb"

const users = Table.make("users", {
  id: Column.text().pipe(Column.primaryKey),
  email: Column.text()
})
const posts = Table.make("posts", {
  id: Column.text().pipe(Column.primaryKey),
  userId: Column.text(),
  published: Column.boolean()
})
const totals = Query.select({
  userId: posts.userId,
  postCount: Function.count(posts.id)
}).pipe(
  Query.from(posts),
  Query.where(Query.eq(posts.published, true)),
  Query.groupBy(posts.userId),
  Query.having(Query.gte(Function.count(posts.id), 2)),
  Query.with("post_totals")
)
const authors = Query.select({
  email: users.email,
  postCount: totals.postCount
}).pipe(
  Query.from(users),
  Query.innerJoin(totals, Query.eq(users.id, totals.userId)),
  Query.orderBy(users.id)
)
type Author = Query.ResultRow<typeof authors>
// { readonly email: string; readonly postCount: Scalar.BigIntString }
```

For the input above, executing `authors` returns:

```json
[{ "email": "ada@example.com", "postCount": "2" }]
```

Counts use canonical integer strings: two is `"2"`, not the JavaScript number `2`.

### Cursor Pagination

This recipe orders by **non-null email, then unique id**, both ascending. The
cursor contains both values from the last returned row. The seek predicate
must match that ordering, including the tie-breaker.

```ts
import { Column, Query, Table } from "effect-qb"

const users = Table.make("users", {
  id: Column.text().pipe(Column.primaryKey),
  email: Column.text()
})
const cursor = { email: "ada@example.com", id: "ada" }
const afterCursor = Query.or(
  Query.gt(users.email, cursor.email),
  Query.and(Query.eq(users.email, cursor.email), Query.gt(users.id, cursor.id))
)
const nextPage = Query.select({ id: users.id, email: users.email }).pipe(
  Query.from(users),
  Query.where(afterCursor),
  Query.orderBy(users.email),
  Query.orderBy(users.id),
  Query.limit(20)
)
```

Omit the seek predicate for the first page. Validate and encode cursors in your
application; changing the order, null policy, or filters changes the cursor
contract. Descending order needs reversed comparisons. This is not snapshot
pagination: concurrent changes can move rows between pages. Offset pagination
below is simpler when the caller needs page numbers rather than a continuation.

### Update Stored JSON

**Runs on SQLite.** Create a document with city `"Rome"` and decoded count `7`,
update only the document with id `"guide"`, then read it back. The update changes
the city to `"Paris"` and the stored count to the JSON string `"42"`.

| Read | Returned count | Why |
| --- | --- | --- |
| Whole `payload` column | `42` (number) | The column codec decodes the stored string |
| `payload.profile.count` path | `"42"` (string) | Paths return the stored encoded value |

The schema uses `NumberFromString` to encode numbers as JSON strings. Inserts
accept decoded values; path replacements supply stored values, so the mutation
uses `"42"`, not `42`.

```ts
import { SqliteClient } from "@effect/sql-sqlite-node"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { Column, Json, Query, Table } from "effect-qb"
import { Executor } from "effect-qb/sqlite"

const documents = Table.make("documents", {
  id: Column.text().pipe(Column.primaryKey),
  payload: Column.json(Schema.Struct({
    profile: Schema.Struct({ city: Schema.String, count: Schema.NumberFromString })
  }))
})
const profile = Json.focus().key("profile")
const updated = documents.payload.pipe(
  Json.replace(profile.key("city"), "Paris"),
  Json.replace(profile.key("count"), "42") // encoded value, not the decoded number
)
const updateDocument = Query.update(documents, { payload: updated }).pipe(
  Query.where(Query.eq(documents.id, "guide"))
)
const readDocument = Query.select({
  document: documents.payload,
  storedCount: documents.payload.profile.count
}).pipe(Query.from(documents), Query.where(Query.eq(documents.id, "guide")))

// Plans above are values. This Effect creates, seeds, updates, then reads.
const executor = Executor.make()
const program = executor.execute(Query.createTable(documents)).pipe(
  Effect.andThen(executor.execute(Query.insert(documents, {
    id: "guide", payload: { profile: { city: "Rome", count: 7 } }
  }))),
  Effect.andThen(executor.execute(updateDocument)),
  Effect.andThen(executor.execute(readDocument)),
  Effect.provide(SqliteClient.layer({ filename: ":memory:" }))
)
const rows = await Effect.runPromise(program)
console.log(rows)
// [{ document: { profile: { city: "Paris", count: 42 } }, storedCount: "42" }]
```

The update expression runs in the database; JavaScript does not fetch and rewrite
the existing payload. Use existing parent containers
for consistent behavior across engines; see [Reusable JSON Focuses](#reusable-json-focuses)
for missing paths and shape-changing updates.

### Offset Pagination

<details>
<summary>Show example</summary>

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
  Query.orderBy(users.id),
  Query.limit(20),
  Query.offset(40)
)

const rendered = Pg.Renderer.make().render(page)
// select "users"."id" as "id", "users"."email" as "email", "users"."displayName" as "displayName" from "users" where ("users"."active" = $1) order by "users"."email" asc, "users"."id" asc limit $2 offset $3
```

</details>

### Postgres Upsert Returning a Row

<details>
<summary>Show example</summary>

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

### CamelCase Models, snake_case SQL

<details>
<summary>Show example</summary>

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
- [`effect-db`](packages/database/README.md) is the companion package for schema-management CLI workflows.

## Reference

### API Map

Root modules:

| Module | Purpose |
| --- | --- |
| `Column` | portable column definitions and modifiers |
| `Table` | portable table definitions, aliases, derived schemas |
| `PrimaryKey`, `Unique`, `Index`, `ForeignKey`, `Check` | portable table-level options |
| `Query` | portable query construction DSL |
| `Type` | portable database-type witnesses for casts and typed references |
| `Cast` | checked explicit database-type conversion |
| `Function` | portable SQL function expressions |
| `Fragment` | typed custom SQL expressions and safely quoted identifiers |
| `Json` | stored JSON paths, construction, and pipeable mutations |
| `Scalar` | expression metadata and canonical scalar result types |
| `RowSet` | shared typed row-set interfaces |
| `Renderer` | standard renderer |
| `Executor` | portable executor contracts and result metadata |
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
