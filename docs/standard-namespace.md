# Standard SQL Namespace

`effect-qb/standard` is for query plans that should stay portable across the built-in SQL engines.

```ts
import * as Std from "effect-qb/standard"

const users = Std.Table.make("users", {
  id: Std.Column.uuid().pipe(Std.Column.primaryKey),
  email: Std.Column.text()
})

const userEmails = Std.Query.select({
  id: users.id,
  email: Std.Function.lower(users.email)
}).pipe(
  Std.Query.from(users)
)
```

Plans built only from `Std.*` carry the `"standard"` dialect tag. A standard plan can be rendered by `Std.Renderer`, `Postgres.Renderer`, `Mysql.Renderer`, or `Sqlite.Renderer`; each renderer still emits its own quoting, placeholder, and function syntax.

The dialect tag rule is:

- `"standard"` stays portable and is accepted by every renderer.
- Combining `"standard"` with a concrete dialect narrows to that concrete dialect.
- Combining two different concrete dialects is a dialect conflict.

Use concrete dialect entrypoints when a query depends on engine-specific SQL. For example, Postgres-only helpers should come from `effect-qb/postgres`; once a plan uses one of those helpers, render it with the Postgres renderer or executor.
