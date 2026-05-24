import { Casing, Column, Query, Table } from "effect-qb"
import * as Pg from "effect-qb/postgres"

const Snake = Casing.casing({
  tables: "snake_case",
  columns: "snake_case"
})

const snakeUsers = Snake.table("UserAccounts", {
  id: Column.uuid().pipe(Column.primaryKey),
  createdAt: Column.datetime(),
  displayName: Column.text()
})

const snakePlan = Query.select({
  createdAt: snakeUsers.createdAt,
  displayName: snakeUsers.displayName
}).pipe(
  Query.from(snakeUsers),
  Query.where(Query.eq(snakeUsers.displayName, "Alice"))
)

Pg.Renderer.make({
  casing: {
    tables: "snake_case",
    columns: "snake_case",
    schemas: "snake_case"
  }
}).render(snakePlan)

Table.make("UserAccounts", {
  id: Column.uuid().pipe(Column.primaryKey),
  createdAt: Column.datetime()
}).pipe(
  Casing.withCasing({ columns: "snake_case" })
)

// @ts-expect-error casing pipes only apply to tables or schema factories
snakePlan.pipe(Casing.withCasing({ columns: "snake_case" }))
// @ts-expect-error casing helpers only apply to tables or schema factories
Casing.withCasing({ columns: "snake_case" })("not-a-casing-target")

// @ts-expect-error casing styles are a closed set unless a custom function is supplied
Casing.casing({ columns: "snakeCase" })
