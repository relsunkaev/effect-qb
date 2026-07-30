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

const sum = Pg.Function.sum(users.score)
const sumRuntime: Scalar.BigIntString = undefined as unknown as NonNullable<Scalar.RuntimeOf<typeof sum>>
void sumRuntime

const count = Function.count(users.id)
const countRuntime: Scalar.BigIntString = undefined as unknown as Scalar.RuntimeOf<typeof count>
const rowNumber = Function.rowNumber({
  orderBy: [{ value: users.id }]
})
const rowNumberRuntime: Scalar.BigIntString = undefined as unknown as Scalar.RuntimeOf<typeof rowNumber>
const firstValue = Function.firstValue(users.score, {
  orderBy: [{ value: users.id }]
})
const firstValueNullability: "never" = undefined as unknown as Scalar.NullabilityOf<typeof firstValue>
void countRuntime
void rowNumberRuntime
void firstValueNullability

Function.firstValue(users.score, {
  orderBy: [{ value: users.id }],
  // @ts-expect-error explicit frames have dialect-specific boundary semantics
  frame: {
    unit: "rows",
    start: "currentRow",
    end: { preceding: 1 }
  }
})

Function.over(Function.count(users.id), {
  orderBy: [{ value: users.id }],
  // @ts-expect-error explicit aggregate frames are dialect-specific
  frame: {
    unit: "rows",
    start: "unboundedPreceding",
    end: "currentRow"
  }
})

const pgFramedFirstValue = Pg.Function.firstValue(users.score, {
  orderBy: [{ value: users.id }],
  frame: {
    unit: "rows",
    start: { preceding: 1 },
    end: { preceding: 1 }
  }
})
const pgFramedFirstValueNullability: "maybe" =
  undefined as unknown as Scalar.NullabilityOf<typeof pgFramedFirstValue>
void pgFramedFirstValueNullability

// @ts-expect-error explicitly framed window specs are exported by dialect Function modules
type PortableWindowSpec = Query.WindowSpec

// @ts-expect-error sum has dialect-specific result and accumulation semantics
Function.sum(users.score)
// @ts-expect-error avg has dialect-specific result and accumulation semantics
Function.avg(users.score)

// @ts-expect-error arithmetic inputs must decode to numbers
Function.add(users.email, 1)

const numericRuntimeText = Fragment.expression({
  dbType: Type.text(),
  schema: Schema.Number,
  nullability: "never"
})`length(${users.email})`
// @ts-expect-error arithmetic support follows the database type, not only the runtime schema
Function.add(numericRuntimeText, 1)

// @ts-expect-error coalesce inputs must share a portable database type family
Function.coalesce(users.email, users.score)

const jsonRows = Table.make("json_rows", {
  payload: Column.json(Schema.Unknown)
})
// @ts-expect-error max requires an ordered database type
Function.max(jsonRows.payload)
// @ts-expect-error min requires an ordered database type
Function.min(jsonRows.payload)

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

Pg.Function.over(Pg.Function.sum(users.score), {
  orderBy: [{ value: users.id }],
  frame: {
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

Pg.Function.over(Pg.Function.sum(users.score), {
  orderBy: [{ value: users.id }],
  frame: {
    unit: "groups",
    start: "unboundedPreceding",
    end: "currentRow"
  }
})

Sq.Function.over(Sq.Function.sum(users.score), {
  orderBy: [{ value: users.id }],
  frame: {
    unit: "groups",
    start: "unboundedPreceding",
    end: "currentRow"
  }
})

My.Function.over(My.Function.sum(users.score), {
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
