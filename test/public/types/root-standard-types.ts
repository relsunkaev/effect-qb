import { Column, Function, Query, Renderer, Table } from "effect-qb"

// @ts-expect-error root exports portable modules directly, not the transitional Sql namespace
import { Sql } from "effect-qb"

const users = Table.make("users", {
  id: Column.uuid().pipe(Column.primaryKey),
  email: Column.text()
})

const rootPlan = Query.select({
  id: users.id,
  email: Function.lower(users.email)
}).pipe(
  Query.from(users)
)

Renderer.make().render(rootPlan)
