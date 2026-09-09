# Dialect coercion contract audit

Status: approved baseline and implemented rules for `effect-qb-ugi`.

## Verification targets

The repository provisions PostgreSQL 16 and MySQL 8.4 in
`docker-compose.integration.yml`. SQLite comes from the installed driver/runtime.
The focused probes passed on PostgreSQL 16.15, MySQL 8.4.11, and Bun SQLite
3.54.0. Those observations do not prove every release in a version range.

Approved support baseline: PostgreSQL 16.x and MySQL 8.4.x, with the SQLite
version supplied by each supported driver tested separately. Widening the
baseline needs additional engine jobs, not just a lower version in prose.
No server-version parameter or automatic session-mode mutation is proposed.

MySQL probes cover empty `sql_mode` and
`STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION`.
Production callers still own their session modes, collation, timezone, and
connection configuration. MariaDB is not covered by MySQL results. SQLite
STRICT tables are a storage policy, not a different expression-cast mode.

## Existing owners and gaps

| Owner | Current responsibility | Audit finding |
| --- | --- | --- |
| `internal/datatypes/matrix.ts` | Built-in families, kinds, implicit/cast targets, engine SQL names | PostgreSQL 16 kind-pair rules and MySQL 8.4 unsupported CAST targets supplement family metadata. |
| `internal/datatypes/lookup.ts` | Cast and comparison admissibility | PostgreSQL casts no longer inherit comparison groups. Arrays check element casts; named enums/records keep their identities. |
| `standard/cast.ts` | Public cast input checks and result type | JSONB primitive casts inspect stored shapes. Numeric/boolean guards remain stricter than native JSONB cast availability. |
| Dialect renderers and runtime mappings | SQL cast syntax and driver decoding | Exact numeric witnesses decode to strings; that does not promise exact arithmetic on every engine. |
| Mutation assignment checks | Destination compatibility | Must remain separate from explicit cast and comparison rules. |

Keep this ownership. Fix modeled built-in pair rules in the existing datatype
lookup/matrix, rather than adding a second compatibility engine or querying a
live catalog during TypeScript compilation. Numeric division and precision
contracts consume these same witnesses; they do not need another type registry.

The rejected pairs were approved with the baseline contract.
Custom types, extensions, user-defined casts, enum identity, domains and
container element conversions cannot be assumed supported from a matching
family alone. Caller-provided metadata is an assertion, not server discovery.
No new escape hatch or runtime validation is proposed.

## Engine distinctions verified

`coercion-contract.integration.ts` uses production executors for fractional
casts and the existing SQL clients for engine-policy probes:

- PostgreSQL `text` to integer works explicitly; comparing typed text with an
  integer fails. Boolean to numeric fails. Assignment conversion is a separate
  context, not a consequence of explicit castability.
- MySQL casts `2.675` to unqualified DECIMAL as `3`. Invalid numeric text compares
  equal to zero in SELECT under both tested modes; strict mode does not make
  SELECT comparison conversion reject that value.
- SQLite casts invalid numeric text to integer zero, but rejects that text when
  inserting into a STRICT integer column. Numeric text `1` is stored as an
  integer. Literal text `1` does not compare equal to integer `1` without affinity.
- SQLite's raw NUMERIC cast of `2.675` returns a JavaScript number. The standard
  numeric witness decodes it to the string `2.675`. PostgreSQL also returns
  `2.675` for an unqualified numeric cast. Matching output types therefore do
  not imply matching precision or storage.

The paired type tests cover explicit text-to-integer casts, rejection of the
corresponding uncast comparison, and string output for exact numeric witnesses.
The additional matrix suite verifies all 4,225 PostgreSQL native kind pairs for
explicit casts and another 4,225 for equality operator resolution. MySQL tests
all 44 modeled target spellings through the production renderer.

## Sources and interpretation

PostgreSQL distinguishes explicit, assignment and implicit contexts in
[`pg_cast`](https://www.postgresql.org/docs/16/catalog-pg-cast.html). That catalog
omits generic conversions, including some I/O and domain conversions, so it
cannot be copied verbatim into a complete cast matrix.

MySQL documents the target syntax and default DECIMAL scale in
[cast functions](https://dev.mysql.com/doc/refman/8.4/en/cast-functions.html),
and comparison conversion separately in
[type conversion](https://dev.mysql.com/doc/refman/8.4/en/type-conversion.html).

SQLite documents [expression casts](https://www.sqlite.org/lang_expr.html#castexpr),
[column affinity](https://www.sqlite.org/datatype3.html), and
[STRICT storage](https://www.sqlite.org/stricttables.html) separately. Preserve
those distinctions in the type model; accepting a CAST says nothing about
whether an arbitrary value can be stored losslessly.

The portable API must promise supported syntax and compatible modeled runtime
semantics, not identical coercion, precision, collation or failure behavior.
Value-dependent failures remain runtime concerns. PostgreSQL equality evidence
is an upper bound: existing comparison policies can remain more restrictive,
and ordering still requires the ordered trait.

## Rejected casts and migration

- PostgreSQL boolean casts only to int4 among numeric kinds. Choose an explicit
  int4 intermediate before converting to numeric.
- PostgreSQL time has no date component and cannot cast directly to timestamp.
  Construct the intended date/time explicitly.
- PostgreSQL arrays require an existing element cast. A scalar does not become
  an array through CAST; use an array constructor. Array-to-JSON uses toJson or
  toJsonb, not CAST.
- Different enum/record names are not interchangeable. Text I/O is explicit and
  can fail for values the destination does not accept.
- MySQL tinyint/smallint/mediumint, text/blob size variants, bool, bit, varbinary,
  fixed, geometry, enum and set are not supported CAST target spellings. Their
  column witnesses remain available for DDL. Use an applicable supported target
  such as the portable integer/boolean witness or binary; do not assume it
  preserves the narrower column's size or range.

A string representation is not an implicit comparison conversion. The native
equality guard rejects unrelated PostgreSQL identifier and OID kinds even when
their metadata shares a family.

## Evidence limits

The PostgreSQL matrix executes typed NULL expressions, so it proves cast
availability and operator resolution, not successful conversion of every value.
Fractional casts, array element conversion and enum/text conversion also run
through production executors. MySQL warnings, spatial shape restrictions,
invalid textual values, precision loss, timezone and collation effects remain
runtime/configuration concerns. No session settings are changed by the library.

The SQLite probe currently covers Bun's SQLite 3.54.0 with JSON1. Other SqlClient
or custom-driver configurations need the same probe on their embedded SQLite
version; this is not a claim that every SQLite driver/version is qualified.

User-defined casts and extension types such as citext are outside the native
PostgreSQL matrix. Explicit custom descriptors remain caller assertions, not
catalog discovery. Domain constraints and named-type search_path resolution are
also caller/server responsibilities. Built-in cast rules do not authorize
assignment/storage conversion, and SQLite STRICT storage remains separate.
