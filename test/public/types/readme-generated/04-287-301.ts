// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 287-301

// README.md:287-301
import { Column, Function, Query, Table, Type } from "effect-qb"

const profiles = Table.make("profiles", {
  id: Column.uuid().pipe(Column.primaryKey),
  displayName: Column.text().pipe(Column.nullable),
  displayLabel: Column.text().pipe(Column.generated(
    Function.coalesce(Query.column("displayName", Type.text()), "Anonymous")
  ))
})

type NewProfile = Table.InsertOf<typeof profiles>
// { readonly id: string; readonly displayName?: string | null }
// displayLabel is computed by the database, not supplied by the caller.

export {};
