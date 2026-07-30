import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

import { Column, Fragment, Function, Query, Scalar, Table, Type } from "effect-qb"
import * as My from "effect-qb/mysql"
import * as Pg from "effect-qb/postgres"
import { Executor as PgExecutor } from "effect-qb/postgres"
import * as Sq from "effect-qb/sqlite"

const users = Table.make("users", {
  id: Column.int().pipe(Column.primaryKey),
  score: Column.int(),
  nullableScore: Column.int().pipe(Column.nullable),
  email: Column.text()
})

const custom = Fragment.expression({
  dbType: Type.text(),
  schema: Schema.String,
  nullability: "never"
})`lower(${users.email})`

const customRuntime: string = undefined as unknown as Scalar.RuntimeOf<typeof custom>
void customRuntime

const sum = Function.sum(users.score)
const sumRuntime: number = undefined as unknown as NonNullable<Scalar.RuntimeOf<typeof sum>>
void sumRuntime

// @ts-expect-error arithmetic inputs must decode to numbers
Function.add(users.email, 1)

// @ts-expect-error division is not portable across the supported dialects
Function.divide(users.score, 2)
// @ts-expect-error modulo has dialect-specific result and zero semantics
Function.modulo(users.score, 2)
// @ts-expect-error rounding has dialect-specific type and tie semantics
Function.round(users.score)

const include = true as boolean
const selection = {
  id: users.id,
  ...Query.includeIf(include, { email: users.email })
}
const maybeEmail: typeof users.email | undefined = selection.email
void maybeEmail
const dynamicPlan = Query.select(selection).pipe(Query.from(users))
const dynamicRow: Query.ResultRow<typeof dynamicPlan> = { id: 1 }
void dynamicRow

const plan = Query.select({ id: users.id }).pipe(Query.from(users))
const executor = PgExecutor.make()

const optionEffect: Effect.Effect<
  Option.Option<Query.ResultRow<typeof plan>>,
  unknown,
  unknown
> = executor.execute(plan).pipe(PgExecutor.atMostOne)
void optionEffect

const prepared = executor.prepare(plan)
const rowEffect: Effect.Effect<Query.ResultRow<typeof plan>, unknown, unknown> =
  prepared.execute.pipe(PgExecutor.exactlyOne)
void rowEffect

Function.over(Function.sum(users.score), {
  orderBy: [{ value: users.id }],
  frame: {
    // @ts-expect-error GROUPS frames are not portable to MySQL
    unit: "groups",
    start: "unboundedPreceding",
    end: "currentRow"
  }
})

Function.lag(users.score, {
  spec: {
    orderBy: [{ value: users.id }],
    // @ts-expect-error lag uses ordering, not a window frame
    frame: {
      unit: "rows",
      start: "unboundedPreceding",
      end: "currentRow"
    }
  }
})

Pg.Function.over(Function.sum(users.score), {
  orderBy: [{ value: users.id }],
  frame: {
    unit: "groups",
    start: "unboundedPreceding",
    end: "currentRow"
  }
})

Sq.Function.over(Function.sum(users.score), {
  orderBy: [{ value: users.id }],
  frame: {
    unit: "groups",
    start: "unboundedPreceding",
    end: "currentRow"
  }
})

My.Function.over(Function.sum(users.score), {
  orderBy: [{ value: users.id }],
  frame: {
    // @ts-expect-error MySQL does not support GROUPS frames
    unit: "groups",
    start: "unboundedPreceding",
    end: "currentRow"
  }
})

const insert = Query.insert(users, {
  id: 1,
  score: 2,
  nullableScore: null,
  email: "a@example.com"
})

// @ts-expect-error EXPLAIN is limited to read plans
executor.explain(insert)

const sqliteExecutor = Sq.Executor.make()
// @ts-expect-error SQLite has no EXPLAIN ANALYZE option
sqliteExecutor.explain(plan, { analyze: true })

const mysqlExecutor = My.Executor.make()
// @ts-expect-error MySQL EXPLAIN ANALYZE always uses TREE output
mysqlExecutor.explain(plan, { analyze: true, format: "json" })
