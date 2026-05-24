# Standard SQL Namespace

The root modules from `effect-qb` are the default import path for query plans that should stay portable across the built-in SQL engines. `effect-qb/standard` remains available as an explicit portable subpath.

```ts
import { Column, Function, Query, Renderer, Table } from "effect-qb"

const users = Table.make("users", {
  id: Column.uuid().pipe(Column.primaryKey),
  email: Column.text()
})

const userEmails = Query.select({
  id: users.id,
  email: Function.lower(users.email)
}).pipe(
  Query.from(users)
)
```

Plans built only from root modules carry the `"standard"` dialect tag. A standard plan can be rendered by `Renderer`, `Postgres.Renderer`, `Mysql.Renderer`, or `Sqlite.Renderer`; each renderer still emits its own quoting, placeholder, and function syntax.

The dialect tag rule is:

- `"standard"` stays portable and is accepted by every renderer.
- Combining `"standard"` with a concrete dialect narrows to that concrete dialect.
- Combining two different concrete dialects is a dialect conflict.

Use concrete dialect entrypoints when a query depends on engine-specific SQL. For example, Postgres-only helpers should come from `effect-qb/postgres`; once a plan uses one of those helpers, render it with the Postgres renderer or executor.
