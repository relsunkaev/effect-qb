// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 1013-1031, 1037-1048, 1056-1066, 1074-1078, 1084-1102, 1110-1126, 1132-1150

// README.md:1013-1031
import { Column as C, Query as Q, Table } from "effect-qb/postgres"

const users = Table.make("users", {
  id: C.text().pipe(C.primaryKey),
  email: C.text()
})

const posts = Table.make("posts", {
  id: C.text().pipe(C.primaryKey),
  userId: C.text(),
  title: C.text()
})

const insertUser = Q.insert(users, {
  id: "user-1",
  email: "alice@example.com"
})

{
  // README.md:1037-1048
  const pendingUsers = Q.values([
    { id: "user-1", email: "alice@example.com" },
    { id: "user-2", email: "bob@example.com" }
  ]).pipe(
    Q.as("pending_users")
  )

  const insertMany = Q.insert(users).pipe(
    Q.from(pendingUsers)
  )
}

{
  // README.md:1056-1066
  const updateUsers = Q.update(users, {
    email: "author@example.com"
  }).pipe(
    Q.from(posts),
    Q.where(Q.and(
      Q.eq(posts.userId, users.id),
      Q.eq(posts.title, "hello")
    ))
  )
}

{
  // README.md:1074-1078
  const deleteUser = Q.delete(users).pipe(
    Q.where(Q.eq(users.id, "user-1"))
  )
}

{
  // README.md:1084-1102
  const insertOrIgnore = Q.insert(users, {
    id: "user-1",
    email: "alice@example.com"
  }).pipe(
    Q.onConflict(["id"])
  )

  const upsertUser = Q.insert(users, {
    id: "user-1",
    email: "alice@example.com"
  }).pipe(
    Q.onConflict(["id"], {
      update: {
        email: Q.excluded(users.email)
      }
    })
  )
}

{
  // README.md:1110-1126
  const insertedUser = Q.insert(users, {
    id: "user-1",
    email: "alice@example.com"
  }).pipe(
    Q.returning({
      id: users.id,
      email: users.email
    })
  )

  type InsertedUserRow = Q.ResultRow<typeof insertedUser>
  // {
  //   id: string
  //   email: string
  // }
}

{
  // README.md:1132-1150
  const insertedUsers = Q.insert(users, {
    id: "user-1",
    email: "alice@example.com"
  }).pipe(
    Q.returning({
      id: users.id,
      email: users.email
    }),
    Q.with("inserted_users")
  )

  const insertedUsersPlan = Q.select({
    id: insertedUsers.id,
    email: insertedUsers.email
  }).pipe(
    Q.from(insertedUsers)
  )
}

export {};
