// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 829-851, 856-864

// README.md:829-851
import { Column, Query, Renderer, Table } from "effect-qb"

const users = Table.make("users", {
  id: Column.uuid().pipe(Column.primaryKey),
  email: Column.text()
})

const incomplete = Query.select({
  email: users.email
})

// @ts-expect-error renderable plans must include every referenced source
Renderer.make().render(incomplete)

const complete = incomplete.pipe(Query.from(users))
const rendered = Renderer.make().render(complete)

type RenderedRow = Renderer.RowOf<typeof rendered>
// {
//   readonly email: string
// }

{
  // README.md:856-864
  const dynamicAlias: string = "users_alias"

  // @ts-expect-error derived source aliases must be literal strings
  Query.as(complete, dynamicAlias)

  // @ts-expect-error derived source aliases must be non-empty
  Query.as(complete, "")
}

export {};
