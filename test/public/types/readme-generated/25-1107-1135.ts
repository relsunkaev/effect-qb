// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 1107-1135

// README.md:1107-1135
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
  remainder: Pg.Function.modulo(amounts.count, 2),
  rounded: Pg.Function.round(postgresExact, 2)
}).pipe(Query.from(amounts))

const mysqlPlan = Query.select({
  remainder: My.Function.modulo(amounts.exact, amounts.count),
  rounded: My.Function.round(amounts.exact, 2)
}).pipe(Query.from(amounts))

const sqlitePlan = Query.select({
  remainder: Sq.Function.modulo(amounts.value, amounts.count),
  rounded: Sq.Function.round(amounts.exact, 2)
}).pipe(Query.from(amounts))

export {};
