# SQLite on Node.js

Effect 4's `@effect/sql-sqlite-node` uses built-in `node:sqlite`. Install it at
`^4.0.0` alongside `effect@^4.0.0` and `effect-qb`. This driver requires Node 22.16
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
transaction rollback, buffered executor streams, native division, and mutations.

The driver uses synchronous SQLite calls, so busy waits block Node's event loop.
The driver's SQL streaming API and `updateValues` are unsupported. The
`effect-qb` SQLite executor's stream still works: it buffers a read result and
emits its rows, rather than streaming from the database. `effect-qb` does not
install or select a SQLite driver on the consumer's behalf.
