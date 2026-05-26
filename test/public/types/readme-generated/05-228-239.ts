// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 228-239

// README.md:228-239
import { Column, Table } from "effect-qb"

const publicSchema = Table.schema("public")

const users = publicSchema.table("users", {
  id: Column.uuid().pipe(Column.primaryKey),
  email: Column.text()
})

void users

export {};
