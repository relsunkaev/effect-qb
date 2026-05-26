// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 887-931

// README.md:887-931
import * as Schema from "effect/Schema"
import { Column, Table } from "effect-qb"
import * as Pg from "effect-qb/postgres"

const users = Table.make("users", {
  id: Column.uuid().pipe(
    Column.primaryKey,
    Column.generated(Pg.Query.literal("generated-user-id"))
  ),
  email: Column.text(),
  displayName: Column.text().pipe(Column.nullable)
})

type UserInsert = Table.InsertOf<typeof users>
type UserUpdate = Table.UpdateOf<typeof users>

const insertUser: UserInsert = {
  email: "ada@example.com"
}

const updateUser: UserUpdate = {
  displayName: null
}

// @ts-expect-error generated primary keys are not insert payload fields
const insertWithId: UserInsert = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  email: "ada@example.com"
}

// @ts-expect-error primary keys are not update payload fields
const updateWithId: UserUpdate = {
  id: "550e8400-e29b-41d4-a716-446655440000"
}

const insertSchema = Table.insertSchema(users)
type UserInsertFromSchema = Schema.Schema.Type<typeof insertSchema>

type _UserInsertFromSchema = UserInsertFromSchema
void insertUser
void updateUser
void insertWithId
void updateWithId

export {};
