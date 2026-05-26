// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 93-120

// README.md:93-120
import { Column, Function, Query, Table } from "effect-qb"
import * as Pg from "effect-qb/postgres"

const users = Table.make("users", {
  id: Column.uuid().pipe(Column.primaryKey),
  email: Column.text(),
  displayName: Column.text(),
  bio: Column.text().pipe(Column.nullable)
})

const userDirectory = Query.select({
  id: users.id,
  email: Function.lower(users.email),
  displayName: users.displayName
}).pipe(
  Query.from(users),
  Query.where(Query.isNotNull(users.bio)),
  Query.orderBy(users.email)
)

type UserDirectoryRow = Query.ResultRow<typeof userDirectory>

const postgresSql = Pg.Renderer.make().render(userDirectory)

void postgresSql
type _UserDirectoryRow = UserDirectoryRow

export {};
