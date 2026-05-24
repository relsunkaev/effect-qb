// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 993-1011

// README.md:993-1011
import { Column as C, Table } from "effect-qb"
import * as Pg from "effect-qb/postgres"

const users = Table.make("users", {
  id: C.uuid().pipe(C.primaryKey),
  email: C.text(),
  bio: C.text().pipe(C.nullable)
})

const recentEmails = Pg.Query.select({
  id: users.id,
  email: users.email
}).pipe(
  Pg.Query.from(users),
  Pg.Query.distinctOn(users.email),
  Pg.Query.orderBy(users.email)
)

export {};
