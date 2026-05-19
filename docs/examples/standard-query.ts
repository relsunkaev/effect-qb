import * as Pg from "effect-qb/postgres"
import * as Std from "effect-qb/standard"

const users = Std.Table.make("users", {
  id: Std.Column.uuid().pipe(Std.Column.primaryKey),
  email: Std.Column.text()
})

export const portableUsers = Std.Query.select({
  id: users.id,
  email: Std.Function.lower(users.email)
}).pipe(
  Std.Query.from(users)
)

export const renderedForPostgres = Pg.Renderer.make().render(portableUsers)
