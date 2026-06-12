// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 264-278

// README.md:264-278
import { Column, Index, Table } from "effect-qb"

class Users extends Table.Class<Users>("users")({
  id: Column.uuid().pipe(Column.primaryKey),
  email: Column.text(),
  displayName: Column.text().pipe(Column.nullable)
}) {
  static readonly [Table.options] = [
    Index.make((table) => table.email).pipe(Index.named("users_email_idx"))
  ]
}

const usersByEmail = Users.email

export {};
