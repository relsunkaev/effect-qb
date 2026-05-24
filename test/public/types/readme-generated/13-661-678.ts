// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 661-678

// README.md:661-678
import { Column as C, Function as F, Query as Q, Table } from "effect-qb"
import { Json as J } from "effect-qb/postgres"

const users = Table.make("users", {
  id: C.uuid().pipe(C.primaryKey),
  email: C.text(),
  bio: C.text().pipe(C.nullable)
})

const userSummary = Q.select({
  email: F.lower(users.email),
  bio: F.coalesce(users.bio, "anonymous"),
  seenAt: F.currentTimestamp()
}).pipe(
  Q.from(users)
)

export {};
