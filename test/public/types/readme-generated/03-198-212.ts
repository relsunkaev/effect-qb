// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 198-212

// README.md:198-212
import * as Schema from "effect/Schema"
import { Column as C, Function as F, Query as Q, Table } from "effect-qb/postgres"

const users = Table.make("users", {
  id: C.uuid().pipe(C.primaryKey, C.generated(Q.literal("generated-user-id"))),
  email: C.text().pipe(C.unique),
  bio: C.text().pipe(C.nullable),
  createdAt: C.timestamp().pipe(C.default(F.localTimestamp()))
})

Schema.isSchema(users.schemas.select)
Schema.isSchema(users.schemas.insert)
Schema.isSchema(users.schemas.update)

export {};
