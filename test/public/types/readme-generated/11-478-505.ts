// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 478-505

// README.md:478-505
import * as Schema from "effect/Schema"
import { Column, Query, Table } from "effect-qb"

const users = Table.make("users", {
  id: Column.uuid().pipe(
    Column.primaryKey,
    Column.generated(Query.literal("generated-user-id"))
  ),
  email: Column.text(),
  displayName: Column.text().pipe(Column.nullable)
})

const insertSchema = Table.insertSchema(users)
const updateSchema = Table.updateSchema(users)

const parsedInsert = Schema.decodeUnknownSync(insertSchema)({
  email: "ada@example.com"
})
const parsedUpdate = Schema.decodeUnknownSync(updateSchema)({
  displayName: null
})

type UserInsertFromSchema = Schema.Schema.Type<typeof insertSchema>
// same shape as UserInsert
type UserUpdateFromSchema = Schema.Schema.Type<typeof updateSchema>
// same shape as UserUpdate

export {};
