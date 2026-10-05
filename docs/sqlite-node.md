# SQLite on Node.js

Effect 4's `@effect/sql-sqlite-node` uses built-in `node:sqlite`. Install it at
`4.0.0` alongside `effect@4.0.0` and `effect-qb`. This driver requires Node 22.16
or newer; other drivers retain their existing runtime requirements.

```ts
import { SqliteClient } from "@effect/sql-sqlite-node"
import * as Effect from "effect/Effect"
import { Query } from "effect-qb"
import { Executor } from "effect-qb/sqlite"

const rows = await Effect.runPromise(
  Executor.make().execute(Query.select({ answer: Query.literal(42) })).pipe(
    Effect.provide(SqliteClient.layer({ filename: ":memory:" }))
  )
)
```

Consumer TypeScript should be built or bundled normally; no runtime TypeScript
loader is needed. The packed-consumer check builds with esbuild and runs under
Node. It covers DDL, transformed JSON codecs, stored JSON paths, prepared reads,
transaction rollback, native division, and mutations.

The driver uses synchronous SQLite calls, so busy waits block Node's event loop.
It does not support streaming queries or `updateValues`; use executor reads
rather than streams with this driver. `effect-qb` does not install or select a
SQLite driver on the consumer's behalf.
