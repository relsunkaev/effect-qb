// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 230-245

// README.md:230-245
import { Column as C, Function as F, Query as Q, Table } from "effect-qb"
import * as Schema from "effect/Schema"
import { Json as J } from "effect-qb/postgres"

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
