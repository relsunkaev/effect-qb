import * as Pg from "effect-qb/postgres"
import { Column, Function, Query, Renderer, Table } from "effect-qb"

const users = Table.make("users", {
  id: Column.uuid().pipe(Column.primaryKey),
  email: Column.text()
})

export const portableUsers = Query.select({
  id: users.id,
  email: Function.lower(users.email)
}).pipe(
  Query.from(users)
)

export const renderedForPostgres = Pg.Renderer.make().render(portableUsers)
