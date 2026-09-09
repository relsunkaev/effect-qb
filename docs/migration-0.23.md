# Migrating to 0.23

Upgrade `effect-qb` and `effect-db` together. The workspace now uses Effect
`4.0.0-rc.112`; align your Effect SQL and platform packages with that release.
Run your application's typecheck before deploying.

## JSON values and custom drivers

Whole-column reads still decode through the column schema. JSON paths and
SQL-side mutations now use the schema's **encoded, stored shape**. For example,
if a field decodes a stored string into a Date, selecting that field through a
JSON path returns the stored string, not a Date. Decode it explicitly in the
application if needed. Raw whole-column writes still accept schema inputs;
SQL-expression assignments are checked against the destination's stored shape.

Property navigation remains supported: `document.someArray[2].someField`.
`Json.focus()` and pipeable `Json.replace()` supplement it; they do not replace
property access. A shape-changing replacement can be selected, but cannot be
assigned back to an incompatible column schema.

PostgreSQL and MySQL default clients return decoded JSON. Custom clients that
return serialized JSON must configure `valueMappings.json.fromDriver` to parse
it. SQLite expects serialized JSON and parses it once; custom SQLite clients
that already decode JSON need an identity mapping. See [JSON transport](json-transport.md)
for configuration and precedence.

No database migration is required. Existing incorrectly typed JSON scalar data
is not repaired automatically. Check affected records separately before writing
any data correction.

## Casts, comparisons, and division

Some previously accepted casts and comparisons now fail typechecking because
the modeled native engine does not support them. Use an engine-supported
conversion rather than suppressing the error. Custom datatype metadata remains
a caller assertion, not a server capability check.

Native division is available only from each dialect's `Function` module.
PostgreSQL integer division truncates and zero denominators fail; MySQL and
SQLite SELECT division can return NULL for zero denominators. Numeric cast
witnesses do not promise portable precision or scale. Column DDL precision is
separate. See [coercion](dialect-coercion-contract.md) and
[division](numeric-division-contract.md) for the tested engine contracts.

## Error handling and mutation inputs

Read-query error types now include `RowDecodeError`. Update exhaustive error
handlers. `Executor.formatRowDecodeError(error)` omits row values and SQL by
default; the original error object still contains them. Rejected schema inputs
and verbose formatting require separate explicit `reportInput: true` options.
Do not enable verbose diagnostics in shared logs.

Derived insert/update schemas distinguish omitted keys from explicit
`undefined`. Omit optional mutation keys instead of assigning `undefined`, unless
the column schema explicitly permits that value.
