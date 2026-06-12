// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 350-360

// README.md:350-360
import { Casing, Column, Table } from "effect-qb"

const users = Table.make("UserAccounts", {
  id: Column.uuid().pipe(Column.primaryKey),
  createdAt: Column.datetime()
}).pipe(
  Casing.withCasing("snake_case")
)


export {};
