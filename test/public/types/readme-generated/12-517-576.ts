// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 517-576

// README.md:517-576
import { Column, Query, Table } from "effect-qb"

const users = Table.make("users", {
  id: Column.uuid().pipe(Column.primaryKey),
  email: Column.text().pipe(Column.unique),
  displayName: Column.text()
})

const draftUsers = Table.make("draft_users", {
  id: Column.uuid().pipe(Column.primaryKey),
  email: Column.text(),
  displayName: Column.text()
})

Query.insert(users, {
  id: "user-id",
  email: "ada@example.com",
  displayName: "Ada"
}).pipe(Query.onConflict("email", {
  update: {
    displayName: Query.excluded(users.displayName)
  }
}))

Query.upsert(users, {
  id: "user-id",
  email: "ada@example.com",
  displayName: "Ada"
}, "email", {
  displayName: "Ada Lovelace"
})

Query.insert(draftUsers, {
  id: "draft-id",
  email: "draft@example.com",
  displayName: "Draft"
}).pipe(
  // @ts-expect-error conflict targets must match a primary key, unique constraint, or unique index
  Query.onConflict("email", {
    update: {
      displayName: Query.excluded(draftUsers.displayName)
    }
  })
)

Query.upsert(
  draftUsers,
  {
    id: "draft-id",
    email: "draft@example.com",
    displayName: "Draft"
  },
  // @ts-expect-error upsert conflict targets must match a primary key, unique constraint, or unique index
  "email",
  {
    displayName: "Draft User"
  }
)

export {};
