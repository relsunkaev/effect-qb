import * as Schema from "effect/Schema"
import { Column, Json, Query, Table } from "#standard"

export const focusDocs = Table.make("focus_docs", {
  payload: Column.json(Schema.Struct({
    profile: Schema.Struct({ city: Schema.String, postcode: Schema.String }),
    pair: Schema.Tuple([Schema.String, Schema.Number]),
    untouched: Schema.Boolean
  }))
})
const profile = Json.focus().key("profile")
export const focusedDocument = focusDocs.payload.pipe(
  Json.replace(profile.key("city"), 123),
  Json.replace(profile.key("postcode"), "75001"),
  Json.replace(Json.focus().key("pair").index(0), true)
)
export const focusQuery = Query.select({ payload: focusedDocument }).pipe(Query.from(focusDocs))
export const focusInput = { profile: { city: "London", postcode: "old" }, pair: ["first", 2], untouched: true }
export const focusExpected = { profile: { city: 123, postcode: "75001" }, pair: [true, 2], untouched: true }

const sparseDocs = Table.make("focus_docs", {
  payload: Column.json(Schema.Struct({
    profile: Schema.optionalKey(Schema.NullOr(Schema.Struct({ city: Schema.optionalKey(Schema.String) }))),
    values: Schema.Array(Schema.Number)
  }))
})
export const sparseFocusQuery = Query.select({
  created: sparseDocs.payload.pipe(Json.replace(Json.focus().key("profile").key("city"), 123)),
  existingOnly: sparseDocs.payload.pipe(Json.replace(Json.focus().key("profile").key("city"), 123, { createMissing: false })),
  arrayItem: sparseDocs.payload.pipe(Json.replace(Json.focus().key("values").index(0), 9))
}).pipe(Query.from(sparseDocs))
export const sparseInputs = [
  { values: [1, 2] },
  { profile: null, values: [1, 2] },
  { profile: {}, values: [1, 2] }
]
export const sparseExpected = (dialect: "postgres" | "mysql" | "sqlite") =>
  sparseInputs.map((input, index) => ({
    created: index === 2 || (index === 0 && dialect === "sqlite")
      ? { ...input, profile: { city: 123 } } : input,
    existingOnly: input,
    arrayItem: { ...input, values: [9, 2] }
  }))
