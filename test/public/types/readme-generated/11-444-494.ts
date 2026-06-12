// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 444-494

// README.md:444-494
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

type UserInsert = Table.InsertOf<typeof users>
// {
//   readonly email: string
//   readonly displayName?: string | null
// }

type UserUpdate = Table.UpdateOf<typeof users>
// {
//   readonly email?: string
//   readonly displayName?: string | null
// }

const insertWithId: UserInsert = {
  // @ts-expect-error generated primary keys are not insert payload fields
  id: "550e8400-e29b-41d4-a716-446655440000",
  email: "ada@example.com"
}

const updateWithId: UserUpdate = {
  // @ts-expect-error primary keys are not update payload fields
  id: "550e8400-e29b-41d4-a716-446655440000"
}

const selectSchema = Table.selectSchema(users)
const insertSchema = Table.insertSchema(users)
const updateSchema = Table.updateSchema(users)
const parsedInsert = Schema.decodeUnknownSync(insertSchema)({
  email: "ada@example.com"
})
const parsedUpdate = Schema.decodeUnknownSync(updateSchema)({
  displayName: null
})

type UserSelectFromSchema = Schema.Schema.Type<typeof selectSchema>
type UserInsertFromSchema = Schema.Schema.Type<typeof insertSchema>
type UserUpdateFromSchema = Schema.Schema.Type<typeof updateSchema>


export {};
