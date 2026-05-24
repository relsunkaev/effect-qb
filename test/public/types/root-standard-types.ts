import { Sql } from "effect-qb"

const users = Sql.Table.make("users", {
  id: Sql.Column.uuid().pipe(Sql.Column.primaryKey),
  email: Sql.Column.text()
})

const rootPlan = Sql.Query.select({
  id: users.id,
  email: Sql.Function.lower(users.email)
}).pipe(
  Sql.Query.from(users)
)

Sql.Renderer.make().render(rootPlan)
