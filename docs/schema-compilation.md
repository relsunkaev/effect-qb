# Opt-in schema compilation

Effect 4 includes an unstable JIT schema compiler. `effect-qb` does not enable it
globally. Consumers can enable specific schemas before constructing their tables:

```ts
import * as Schema from "effect/Schema"
import * as SchemaJITCompiler from "effect/schema/SchemaJITCompiler"
import { Column, Table } from "effect-qb"

const payload = Schema.Struct({ count: Schema.NumberFromString })
SchemaJITCompiler.enable(payload.ast)
SchemaJITCompiler.enable(Schema.toType(payload).ast)
const records = Table.make("records", { payload: Column.json(payload) })
```

Enable the type-side AST too: the executor checks already-decoded values before
decoding stored values. Compilation falls back to interpreted parsing if the
environment blocks code generation. No compiler import is needed for ordinary use.

## Measurement

Run `bun scripts/benchmark-schema-compiler.ts`. It bundles the production row
decoder with esbuild and uses fresh Node processes, alternating interpreted and
per-schema JIT runs. Each run checks decoded results and measures normalization,
validation, transformed JSON decoding, and nested row remapping. Database I/O is
not included.

On the release workstation, 10,000 four-field rows containing ten transformed
JSON items took about 40 ms interpreted versus 28 ms with JIT (warm median).
First schema setup and decode took about 5 ms versus 6–8 ms. These are local
decoder measurements, not an application throughput guarantee. Benchmark your
own schemas and workload before opting in; the compiler API is unstable.
