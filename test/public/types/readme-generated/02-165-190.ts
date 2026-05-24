// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 165-190

// README.md:165-190
import { Column as C, Function as F, Query as Q, Table } from "effect-qb"
import { Json as J, Renderer } from "effect-qb/postgres"

const users = Table.make("users", {
  id: C.uuid().pipe(C.primaryKey),
  email: C.text()
})

const userSummary = Q.select({
  id: users.id,
  email: F.lower(users.email)
}).pipe(
  Q.from(users)
)

type UserSummaryRow = Q.ResultRow<typeof userSummary>
// {
//   id: string
//   email: string
// }

const rendered = Renderer.make().render(userSummary)
rendered.sql
rendered.params

export {};
