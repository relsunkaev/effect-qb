import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

import { Column, Fragment, Function, Query, Scalar, Table } from "effect-qb"
import { Executor as PgExecutor } from "effect-qb/postgres"

const users = Table.make("users", {
  id: Column.int().pipe(Column.primaryKey),
  score: Column.int(),
  nullableScore: Column.int().pipe(Column.nullable),
  email: Column.text()
})

const custom = Fragment.expression({
  dbType: Query.type.text(),
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

Query.select({ id: users.id }).pipe(
  Query.from(users),
  Query.keyset({
    by: [
      { expression: users.score, cursor: 10 },
      { expression: users.id, cursor: 1 }
    ],
    pageSize: 25
  })
)

Query.keyset({ by: [{ expression: users.id, cursor: 1 }], pageSize: 25 })(
  // @ts-expect-error keyset keys must already be available from the plan
  Query.select({ id: Query.literal(1) })
)

// @ts-expect-error cursor type must match the key expression runtime
Query.keyset({ by: [{ expression: users.score, cursor: "10" }], pageSize: 25 })

// @ts-expect-error nullable keys need an explicit non-null expression before keyset pagination
Query.keyset({ by: [{ expression: users.nullableScore, cursor: 10 }], pageSize: 25 })

const plan = Query.select({ id: users.id }).pipe(Query.from(users))
const executor = PgExecutor.make()

const optionEffect: Effect.Effect<
  Option.Option<Query.ResultRow<typeof plan>>,
  unknown,
  unknown
> = executor.executeOption(plan)
void optionEffect

const prepared = executor.prepare(plan)
const rowEffect: Effect.Effect<Query.ResultRow<typeof plan>, unknown, unknown> =
  prepared.executeExactlyOne
void rowEffect

const insert = Query.insert(users, {
  id: 1,
  score: 2,
  nullableScore: null,
  email: "a@example.com"
})

// @ts-expect-error EXPLAIN is limited to read plans
executor.explain(insert)
