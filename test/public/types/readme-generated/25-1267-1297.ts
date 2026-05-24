// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 1267-1297

// README.md:1267-1297
import { Column as C, Function as F, Query as Q, Table } from "effect-qb"
import * as Stream from "effect/Stream"
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
const rowStream = executor.stream(postsPerUser)
const collected = Stream.runCollect(rowStream)

export {};
