// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 530-570

// README.md:530-570
import { Column as C, Function as F, Query as Q, Table } from "effect-qb/postgres"

const users = Table.make("users", {
  id: C.uuid().pipe(C.primaryKey),
  email: C.text(),
  bio: C.text().pipe(C.nullable)
})

const posts = Table.make("posts", {
  id: C.uuid().pipe(C.primaryKey),
  userId: C.uuid(),
  title: C.text().pipe(C.nullable),
  status: C.text()
})

const comments = Table.make("comments", {
  id: C.uuid().pipe(C.primaryKey),
  postId: C.uuid(),
  body: C.text()
})

const listUsers = Q.select({
  id: users.id,
  profile: {
    email: users.email
  },
  hasPosts: Q.literal(true)
}).pipe(
  Q.from(users)
)

type ListUsersRow = Q.ResultRow<typeof listUsers>
// {
//   id: string
//   profile: {
//     email: string
//   }
//   hasPosts: boolean
// }

export {};
