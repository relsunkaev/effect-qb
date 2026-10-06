// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 2125-2144

// README.md:2125-2144
import { Column, Query, Table } from "effect-qb"

const users = Table.make("users", {
  id: Column.text().pipe(Column.primaryKey),
  email: Column.text()
})
const cursor = { email: "ada@example.com", id: "ada" }
const afterCursor = Query.or(
  Query.gt(users.email, cursor.email),
  Query.and(Query.eq(users.email, cursor.email), Query.gt(users.id, cursor.id))
)
const nextPage = Query.select({ id: users.id, email: users.email }).pipe(
  Query.from(users),
  Query.where(afterCursor),
  Query.orderBy(users.email),
  Query.orderBy(users.id),
  Query.limit(20)
)

export {};
