// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 145-159

// README.md:145-159
import * as Std from "effect-qb/standard"

const users = Std.Table.make("users", {
  id: Std.Column.uuid().pipe(Std.Column.primaryKey),
  email: Std.Column.text()
})

const userEmails = Std.Query.select({
  id: users.id,
  email: Std.Function.lower(users.email)
}).pipe(
  Std.Query.from(users)
)

export {};
