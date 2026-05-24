// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 145-159

// README.md:145-159
import { Sql } from "effect-qb"

const users = Sql.Table.make("users", {
  id: Sql.Column.uuid().pipe(Sql.Column.primaryKey),
  email: Sql.Column.text()
})

const userEmails = Sql.Query.select({
  id: users.id,
  email: Sql.Function.lower(users.email)
}).pipe(
  Sql.Query.from(users)
)

export {};
