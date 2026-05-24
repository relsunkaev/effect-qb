# Standard SQL Namespace

The `Sql` namespace from `effect-qb` is the default import path for query plans that should stay portable across the built-in SQL engines. `effect-qb/standard` remains available as an explicit portable subpath.

```ts
import { Sql } from "effect-qb"

const users = Sql.Table.make("users", {
  id: Sql.Column.uuid().pipe(Sql.Column.primaryKey),
  email: Sql.Column.text()
})

const userEmails = Sql.Query.select({
  id: users.id,
  email: Sql.Function.lower(users.email)
}).pipe(
  Sql.Query.from(users)
)
```

Plans built only from `Sql.*` carry the `"standard"` dialect tag. A standard plan can be rendered by `Sql.Renderer`, `Postgres.Renderer`, `Mysql.Renderer`, or `Sqlite.Renderer`; each renderer still emits its own quoting, placeholder, and function syntax.

The dialect tag rule is:

- `"standard"` stays portable and is accepted by every renderer.
- Combining `"standard"` with a concrete dialect narrows to that concrete dialect.
- Combining two different concrete dialects is a dialect conflict.

Use concrete dialect entrypoints when a query depends on engine-specific SQL. For example, Postgres-only helpers should come from `effect-qb/postgres`; once a plan uses one of those helpers, render it with the Postgres renderer or executor.
