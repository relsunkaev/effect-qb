// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 1159-1177

// README.md:1159-1177
import * as Schema from "effect/Schema"
import { Column, Fragment, Query, Table, Type } from "effect-qb"

const users = Table.make("users", {
  id: Column.int().pipe(Column.primaryKey),
  email: Column.text()
})

const normalizedEmail = Fragment.expression({
  dbType: Type.text(),
  schema: Schema.String,
  nullability: "never"
})`coalesce(${users.email}, ${Query.literal("missing")})`

const plan = Query.select({
  normalizedEmail
}).pipe(Query.from(users))

export {};
