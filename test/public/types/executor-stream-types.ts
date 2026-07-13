import * as Std from "effect-qb"
import { Query as Q } from "effect-qb"
import { Executor } from "effect-qb/postgres"

const users = Std.Table.make("users", {
  id: Std.Column.uuid().pipe(Std.Column.primaryKey),
  email: Std.Column.text()
})

const readPlan = Q.select({
  id: users.id,
  email: users.email
}).pipe(
  Q.from(users)
)

const insertPlan = Q.insert(users, {
  id: "11111111-1111-4111-8111-111111111111",
  email: "alice@example.com"
})

const readStream = Executor.make().stream(readPlan)
void readStream

// @ts-expect-error write plans are not streamable
Executor.make().stream(insertPlan)
