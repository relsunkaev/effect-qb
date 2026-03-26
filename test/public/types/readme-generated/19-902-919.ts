// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 902-919

// README.md:902-919
import { Column as C, Query as Q, Table } from "effect-qb/postgres"

const users = Table.make("users", {
  id: C.uuid().pipe(C.primaryKey),
  email: C.text(),
  bio: C.text().pipe(C.nullable)
})

const recentEmails = Q.select({
  id: users.id,
  email: users.email
}).pipe(
  Q.from(users),
  Q.distinctOn(users.email),
  Q.orderBy(users.email)
)

export {};
