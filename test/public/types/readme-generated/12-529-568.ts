// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 529-568

// README.md:529-568
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

// users.email is unique, so it is a valid conflict target.
Query.insert(users, {
  id: "user-id",
  email: "ada@example.com",
  displayName: "Ada"
}).pipe(Query.onConflict("email", {
  update: {
    displayName: Query.excluded(users.displayName)
  }
}))

// draft_users.email has no unique constraint, so it is rejected.
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

export {};
