// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 437-473

// README.md:437-473
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
// id is omitted because it is generated.

type UserUpdate = Table.UpdateOf<typeof users>
// {
//   readonly email?: string
//   readonly displayName?: string | null
// }
// id is omitted because primary keys are not updated.

const insertWithId: UserInsert = {
  // @ts-expect-error generated primary keys are not insert payload fields
  id: "550e8400-e29b-41d4-a716-446655440000",
  email: "ada@example.com"
}

const updateWithId: UserUpdate = {
  // @ts-expect-error primary keys are not update payload fields
  id: "550e8400-e29b-41d4-a716-446655440000"
}

export {};
