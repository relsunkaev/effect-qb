import * as Std from "effect-qb"
import { Query as Q } from "effect-qb"
import { Renderer } from "effect-qb/postgres"

const users = Std.Table.make("users", {
  id: Std.Column.uuid().pipe(Std.Column.primaryKey),
  email: Std.Column.text()
})

const rendered = Renderer.make().render(Q.select({
  id: users.id,
  email: users.email
}).pipe(
  Q.from(users)
))

type RenderedRow = Renderer.RowOf<typeof rendered>

const validRenderedRow: RenderedRow = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "alice@example.com"
}

// @ts-expect-error Renderer.RowOf should require every selected projection.
const missingRenderedField: RenderedRow = {
  id: "11111111-1111-4111-8111-111111111111"
}

const wrongRenderedFieldType: RenderedRow = {
  // @ts-expect-error Renderer.RowOf should preserve the selected projection runtime types.
  id: 123,
  email: "alice@example.com"
}

void validRenderedRow
void missingRenderedField
void wrongRenderedFieldType
