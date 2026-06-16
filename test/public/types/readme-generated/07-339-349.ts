// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 339-349

// README.md:339-349
import { Casing, Column, Table } from "effect-qb"

const users = Table.make("UserAccounts", {
  id: Column.uuid().pipe(Column.primaryKey),
  createdAt: Column.datetime()
}).pipe(
  Casing.withCasing("snake_case")
)


export {};
