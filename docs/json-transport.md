# JSON transport

JSON representation is a driver contract, not something inferred from a string's
contents. The string `42`, the number `42`, and a string containing quotation
marks must remain distinct.

## Native defaults

- PostgreSQL and MySQL executors expect already-decoded JSON from their default
  SQL clients. Returned strings are left intact.
- SQLite executors expect serialized JSON and parse it once. JSON-valued paths
  use `->`, preserving booleans instead of converting them to SQL integers.
  JSON projections cast to text because column affinity can store JSON numbers
  as SQL numbers. Explicit text extraction remains separate.
- JSON literals render as JSON values, not untyped parameters. Default JSON
  input conversion serializes the schema-encoded value, including string scalars.

Paths and mutations return stored encoded values. Whole-column selection still
applies the column schema decoder. Neither behavior changes the stored document
format or requires a database migration.
Existing values written with incorrect JSON scalar types are not rewritten.

## Custom drivers

The same defaults apply when supplying `Executor.driver`. A custom client with
different JSON parsing settings must provide a mapping. For example, a
PostgreSQL client returning serialized JSON can use:

```ts
Pg.Executor.make({
  valueMappings: {
    json: { fromDriver: (raw) => JSON.parse(raw as string) }
  }
})
```

For a SQLite driver that already decodes JSON, use an identity `fromDriver`
mapping instead. Existing column/type mappings retain precedence over
executor-level mappings. `driverMode: "normalized"` still skips normalization
for **all** types; use a JSON mapping when only JSON transport differs.

Previously accepted serialized PostgreSQL/MySQL results now require an explicit
mapping. Malformed SQLite JSON fails at the normalization stage. Invalid decoded
JSON values fail at the schema stage rather than being reparsed or guessed.

Live coverage uses PostgreSQL 16, MySQL 8.4, and SQLite 3.54.0 through
`@effect/sql-sqlite-bun`. It covers literals, column reads and writes, constructors,
derived queries, and paths after deletion, insertion, merge, and replacement.
