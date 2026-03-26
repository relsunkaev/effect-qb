// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 707-725

// README.md:707-725
import * as Pg from "effect-qb/postgres"
import { Column as C, Function as F, Query as Q, Table } from "effect-qb/postgres"

const posts = Table.make("posts", {
  id: C.uuid().pipe(C.primaryKey),
  title: C.text().pipe(C.nullable),
  status: C.text()
})

const shapedPosts = Q.select({
  titleLabel: Q.case()
    .when(Q.isNull(posts.title), "missing")
    .else(F.upper(posts.title)),
  titleAsText: Pg.Cast.to(posts.title, Pg.Type.text())
}).pipe(
  Q.from(posts)
)

export {};
