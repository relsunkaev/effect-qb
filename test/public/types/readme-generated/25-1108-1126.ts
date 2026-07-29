// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 1108-1126

// README.md:1108-1126
import * as Schema from "effect/Schema"
import { Column, Fragment, Query, Table } from "effect-qb"

const users = Table.make("users", {
  id: Column.int().pipe(Column.primaryKey),
  email: Column.text()
})

const normalizedEmail = Fragment.expression({
  dbType: Query.type.text(),
  schema: Schema.String,
  nullability: "never"
})`coalesce(${users.email}, ${Query.literal("missing")})`

const plan = Query.select({
  normalizedEmail
}).pipe(Query.from(users))

export {};
