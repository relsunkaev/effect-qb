// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 1219-1252

// README.md:1219-1252
import { Column as C, Function as F, Query as Q, Table } from "effect-qb"
import { Json as J, Executor as PostgresExecutor } from "effect-qb/postgres"

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
const rowsStream = executor.stream(postsPerUser)

type Rows = Q.ResultRows<typeof postsPerUser>
type Row = Q.ResultRow<typeof postsPerUser>
type Error = PostgresExecutor.PostgresQueryError<typeof postsPerUser>

export {};
