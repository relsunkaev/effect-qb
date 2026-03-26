// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 879-898

// README.md:879-898
import { Column as C, Query as Q, Table } from "effect-qb/postgres"

const users = Table.make("users", {
  id: C.uuid().pipe(C.primaryKey),
  email: C.text(),
  bio: C.text().pipe(C.nullable)
})

const recentUsers = Q.select({
  id: users.id,
  email: users.email
}).pipe(
  Q.from(users),
  Q.distinct(),
  Q.orderBy(users.email),
  Q.limit(10),
  Q.offset(20)
)

export {};
