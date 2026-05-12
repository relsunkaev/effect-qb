import * as Schema from "effect/Schema"

import { Column as C, Json as J, Scalar as E, Table } from "effect-qb/mysql"

const payloadSchema = Schema.Struct({
  profile: Schema.Struct({
    address: Schema.Struct({
      city: Schema.String
    })
  })
})

const docs = Table.make("docs", {
  id: C.uuid().pipe(C.primaryKey),
  payload: C.json(payloadSchema)
})

const suitePath = J.json.path(
  J.json.key("profile"),
  J.json.key("address"),
  J.json.key("suite")
)

const setWithoutCreateExpr = J.json.set(docs.payload, suitePath, "12A", {
  createMissing: false
})

type SetWithoutCreate = E.RuntimeOf<typeof setWithoutCreateExpr>

declare const setWithoutCreate: SetWithoutCreate

// @ts-expect-error createMissing: false should not add a missing object key
setWithoutCreate.profile.address.suite

void setWithoutCreateExpr
