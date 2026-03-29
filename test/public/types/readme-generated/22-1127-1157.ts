// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 1127-1157

// README.md:1127-1157
import { Column as C, Function as F, Json as J, Query as Q, Executor as PostgresExecutor, Table } from "effect-qb/postgres"

const users = Table.make("users", {
  id: C.uuid().pipe(C.primaryKey),
  email: C.text()
})

const posts = Table.make("posts", {
  id: C.uuid().pipe(C.primaryKey),
  userId: C.uuid(),
  title: C.text().pipe(C.nullable)
})

const postsPerUser = Q.select({
  userId: users.id,
  email: users.email,
  postCount: F.count(posts.id)
}).pipe(
  Q.from(users),
  Q.leftJoin(posts, Q.eq(users.id, posts.userId)),
  Q.groupBy(users.id, users.email),
  Q.orderBy(users.email)
)

const executor = PostgresExecutor.make()
const rowsEffect = executor.execute(postsPerUser)

type Rows = Q.ResultRows<typeof postsPerUser>
type Error = PostgresExecutor.PostgresQueryError<typeof postsPerUser>

export {};
