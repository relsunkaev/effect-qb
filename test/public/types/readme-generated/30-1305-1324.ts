// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 1305-1324

// README.md:1305-1324
import { Column, Function, Query, Table } from "effect-qb"

const users = Table.make("users", {
  id: Column.uuid().pipe(Column.primaryKey),
  email: Column.text()
})

const plan = Query.select({
  id: users.id,
  email: Function.lower(users.email)
}).pipe(Query.from(users))

type Row = Query.ResultRow<typeof plan>
// {
//   readonly id: string
//   readonly email: string
// }


export {};
