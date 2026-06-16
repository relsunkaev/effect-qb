// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 980-999

// README.md:980-999
import { Column, Query, Table } from "effect-qb"

const users = Table.make("users", {
  id: Column.int().pipe(Column.primaryKey),
  email: Column.text().pipe(Column.nullable),
  status: Column.text()
})

const filtered = Query.select({ id: users.id }).pipe(
  Query.from(users),
  Query.where(Query.and(
    Query.between(users.id, 1, 100),
    Query.or(
      Query.in(users.status, "active", "archived"),
      Query.isNull(users.email)
    )
  ))
)

export {};
