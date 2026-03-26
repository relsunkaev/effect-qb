// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 1469-1490

// README.md:1469-1490
import { Column as C, Query as Q, Table } from "effect-qb/postgres"

const users = Table.make("users", {
  id: C.uuid().pipe(C.primaryKey),
  email: C.text(),
  bio: C.text().pipe(C.nullable)
})

const missingFrom = Q.select({
  userId: users.id
})

type MissingFrom = Q.CompletePlan<typeof missingFrom>
// {
//   __effect_qb_error__:
//     "effect-qb: query references sources that are not yet in scope"
//   __effect_qb_missing_sources__: "users"
//   __effect_qb_hint__:
//     "Add from(...) or a join for each referenced source before render or execute"
// }

export {};
