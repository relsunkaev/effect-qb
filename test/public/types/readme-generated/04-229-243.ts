// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 229-243

// README.md:229-243
import * as Schema from "effect/Schema"
import { Column as C, Function as F, Json as J, Query as Q, Table } from "effect-qb/postgres"

const users = Table.make("users", {
  id: C.uuid().pipe(C.primaryKey, C.generated(Q.literal("generated-user-id"))),
  email: C.text().pipe(C.unique),
  bio: C.text().pipe(C.nullable),
  createdAt: C.timestamp().pipe(C.default(F.localTimestamp()))
})

Schema.isSchema(Table.selectSchema(users))
Schema.isSchema(Table.insertSchema(users))
Schema.isSchema(Table.updateSchema(users))

export {};
