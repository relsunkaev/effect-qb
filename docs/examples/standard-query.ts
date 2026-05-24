import * as Pg from "effect-qb/postgres"
import { Sql } from "effect-qb"

const users = Sql.Table.make("users", {
  id: Sql.Column.uuid().pipe(Sql.Column.primaryKey),
  email: Sql.Column.text()
})

export const portableUsers = Sql.Query.select({
  id: users.id,
  email: Sql.Function.lower(users.email)
}).pipe(
  Sql.Query.from(users)
)

export const renderedForPostgres = Pg.Renderer.make().render(portableUsers)
