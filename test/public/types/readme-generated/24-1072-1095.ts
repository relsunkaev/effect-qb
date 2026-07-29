// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 1072-1095

// README.md:1072-1095
import { Column, Function, Query, Table } from "effect-qb"

const accounts = Table.make("accounts", {
  id: Column.int().pipe(Column.primaryKey),
  balance: Column.real(),
  active: Column.boolean()
})

const minimum = 100
const onlyActive = true as boolean

const report = Query.select({
  id: accounts.id,
  adjustedBalance: Function.round(Function.add(accounts.balance, 2.5)),
  ...Query.includeIf(onlyActive, { active: accounts.active })
}).pipe(
  Query.from(accounts),
  Query.where(Query.andAll([
    Query.gte(accounts.balance, minimum),
    ...(onlyActive ? [Query.eq(accounts.active, true)] : [])
  ]))
)

export {};
