// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 325-379

// README.md:325-379
import * as Schema from "effect/Schema"
import { Column as C, Executor, Function as F, Json as J, Query as Q, Table } from "effect-qb/postgres"

const users = Table.make("users", {
  id: C.uuid().pipe(C.primaryKey, C.generated(Q.literal("generated-user-id"))),
  happenedOn: C.date().pipe(C.schema(Schema.DateFromString)),
  profile: C.json(Schema.Struct({
    visits: Schema.NumberFromString
  })),
  viewCount: C.int8().pipe(C.schema(Schema.BigIntFromString)),
  total: C.number().pipe(C.schema(Schema.BigDecimalFromString)),
  activeFor: C.interval().pipe(C.schema(Schema.DurationFromString)),
  payloadBase64: C.bytea().pipe(C.schema(Schema.flip(Schema.Uint8ArrayFromBase64))),
  createdAt: C.timestamp().pipe(C.default(F.localTimestamp()))
})

type UserSelect = Table.SelectOf<typeof users>
type UserInsert = Table.InsertOf<typeof users>
type UserUpdate = Table.UpdateOf<typeof users>

const decoded = Schema.decodeUnknownSync(Table.selectSchema(users))({
  id: "11111111-1111-1111-1111-111111111111",
  happenedOn: "2026-03-20",
  profile: {
    visits: "42"
  },
  viewCount: "42",
  total: "12.30",
  activeFor: "5 seconds",
  payloadBase64: new Uint8Array([1, 2, 3]),
  createdAt: "2026-03-20T10:00:00"
})

decoded.happenedOn
// Date

decoded.profile.visits
// number

decoded.viewCount
// bigint

decoded.payloadBase64
// string

const plan = Q.select({
  happenedOn: users.happenedOn,
  profile: users.profile
}).pipe(
  Q.from(users)
)

const rowsEffect = Executor.make().execute(plan)

export {};
