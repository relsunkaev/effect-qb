// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 368-378

// README.md:368-378
import { Casing, Column } from "effect-qb"

const Snake = Casing.make("snake_case")

const users = Snake.table("UserAccounts", {
  id: Column.uuid().pipe(Column.primaryKey),
  createdAt: Column.datetime()
})


export {};
