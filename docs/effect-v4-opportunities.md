# Effect v4 opportunity map for effect-qb

Checked on 2026-05-13 against the current v4 beta line.

## Upstream baseline

- Latest npm beta observed with `bun pm view effect@beta version`: `4.0.0-beta.66`.
- Matching v4 beta packages exist for the drivers we care about, including `@effect/sql-pg@4.0.0-beta.66`, `@effect/sql-mysql2@4.0.0-beta.66`, `@effect/sql-sqlite-bun@4.0.0-beta.66`, and `@effect/platform-bun@4.0.0-beta.66`.
- The standalone `@effect/sql` package still reports a 0.x beta tag, but v4 SQL core is exported from `effect/unstable/sql/*`. The v4 `@effect/sql-pg` package imports `effect/unstable/sql/SqlClient`, `effect/unstable/sql/SqlError`, and `effect/unstable/sql/Statement`.
- The current workspace still depends on Effect 3 and independently versioned Effect packages:
  - `package.json`: `effect@^3.19.3`, `@effect/sql@^0.48.0`, `@effect/cli@^0.75.0`, `@effect/platform-bun@^0.89.0`, `@effect/experimental@^0.57.0`
  - `packages/querybuilder/package.json`: `effect@^3.19.3`, `@effect/sql@^0.48.0`, `@effect/experimental@^0.57.0`
  - `packages/database/package.json`: `effect@^3.19.3`, `@effect/sql@^0.48.0`, `@effect/sql-pg@^0.48.0`, `@effect/cli@^0.75.0`, `@effect/platform-bun@^0.89.0`

Primary upstream sources:

- Effect smol changelog: <https://raw.githubusercontent.com/Effect-TS/effect-smol/main/packages/effect/CHANGELOG.md>
- Latest observed release: <https://github.com/Effect-TS/effect-smol/releases/tag/effect%404.0.0-beta.66>
- Schema migration guide: <https://raw.githubusercontent.com/Effect-TS/effect-smol/main/migration/schema.md>
- Effect v4 package exports from `effect@4.0.0-beta.66`
- SQL driver package metadata and declarations from `@effect/sql-pg@4.0.0-beta.66`

## Current repo touchpoints

- Table schema derivation is concentrated in `packages/querybuilder/src/internal/schema-derivation.ts`. It imports `@effect/experimental/VariantSchema` and derives `select`, `insert`, and `update` variants.
- Runtime scalar schemas are concentrated in `packages/querybuilder/src/internal/runtime/value.ts`, `packages/querybuilder/src/internal/runtime/schema.ts`, and dialect column modules like `packages/querybuilder/src/postgres/column.ts`.
- The row decoder is concentrated in `packages/querybuilder/src/internal/executor.ts`. It normalizes driver values, checks `Schema.is`, falls back to `Schema.decodeUnknownSync`, and wraps failures in the local `RowDecodeError` object.
- The built-in SQL executor imports `@effect/sql/SqlClient` and `@effect/sql/SqlError` from `packages/querybuilder/src/internal/executor.ts`, while `effect-db` imports `@effect/sql` and `@effect/sql-pg` in `packages/database/src/internal/postgres-runtime.ts` and migration/introspection modules.
- The database CLI imports `@effect/cli` and `@effect/platform-bun` in `packages/database/src/cli.ts`.

## Ranked opportunities

### P0: Treat v4 migration as source-breaking, mostly at schema and SQL imports

The migration cannot be a dependency-only bump. The schema migration guide shows several APIs we use have breaking shape changes:

- `Schema.Union(A, B)` becomes `Schema.Union([A, B])`.
- `Schema.Tuple(A, B)` becomes `Schema.Tuple([A, B])`.
- `Schema.Record({ key, value })` becomes `Schema.Record(key, value)`.
- `Schema.Literal("a", "b")` becomes `Schema.Literals(["a", "b"])`.
- `Schema.pattern(regex)` becomes `Schema.check(Schema.isPattern(regex))`.
- `Schema.maxLength(n)` becomes `Schema.check(Schema.isMaxLength(n))`.
- `Schema.finite()` becomes `Schema.check(Schema.isFinite())`.
- `Schema.UUID` becomes `Schema.String.check(Schema.isUUID())`.
- `Schema.filter(...)` becomes either `Schema.check(Schema.makeFilter(...))` or `Schema.refine(...)`, depending on whether it narrows the TypeScript type.

Codebase impact:

- `packages/querybuilder/src/internal/runtime/value.ts` uses `pattern`, `filter`, `Union`, `Record`, and `finite`.
- `packages/querybuilder/src/internal/runtime/schema.ts` uses `Schema.make`, `Union`, `Tuple`, `Record`, `Array`, and manual AST inspection.
- `packages/querybuilder/src/postgres/column.ts` uses `maxLength`, `finite`, `UUID`, and `Uint8ArrayFromSelf`.
- `README.md` examples use v3-style `Schema.Union(...)`.

Recommendation:

1. Do a mechanical schema API migration first.
2. Keep behavior changes out of that pass.
3. Run `bun run test:types` after updating README examples because that regenerates and typechecks README snippets.

### P1: Move table schema derivation off `@effect/experimental/VariantSchema`

Effect v4 ships `VariantSchema` under `effect/unstable/schema/VariantSchema`, and the v4 package exports `effect/unstable/schema`. This maps directly to the current internal `TableSchema` helper in `schema-derivation.ts`.

Why it matters:

- Removes the `@effect/experimental` package from `effect-qb`.
- Aligns select/insert/update derivation with the v4 package layout.
- The beta.66 changelog includes a Schema `Type_<>` provenance fix so "go to definition" on objects made from `Schema.Struct` points back to the correct struct field. That is directly relevant to generated table models and user ergonomics.
- v4 schema-backed classes now expose `makeEffect`, which can construct validated table/domain objects in the Effect error channel instead of throwing.

Implementation shape:

- First preserve the current public `deriveSchemas(...)` return shape.
- Replace the import and adapt the call forms. v4 `FieldOnly`, `FieldExcept`, and `Union` use array arguments, so generated declaration output will change.
- Only after this is green, evaluate `effect/unstable/schema/Model`. It offers built-in `select`, `insert`, `update`, `json`, `jsonCreate`, and `jsonUpdate` variants plus helpers like `Generated`, `Sensitive`, and optional field helpers. That looks valuable for future model-first APIs, but it is broader than a safe migration of the existing table DSL.

Follow-up decision: `docs/effect-v4-schema-model.md` keeps this branch on v4 `VariantSchema` and defers `Model` to a separate model-first API design.

### P1: Adopt v4 SQL core and use the new SQL error shape

The v4 driver packages use `effect/unstable/sql/*`; `@effect/sql-pg@4.0.0-beta.66` no longer depends on the standalone `@effect/sql` package. The v4 SQL core also has a reason-based `SqlError` hierarchy.

Relevant changelog entries:

- beta.37: SQL errors were consolidated into a reason-based shape across Effect and SQL drivers.
- beta.57: each SQL client gets a unique transaction service.
- beta.65: `UniqueViolation` is a distinct SQL error reason instead of the broader `ConstraintError`.

Codebase impact:

- `packages/querybuilder/src/internal/executor.ts` imports `@effect/sql/SqlClient` and probes `SqlClient.TransactionConnection` in `streamFromSqlClient`.
- v4 `SqlClient` exposes `sql.transactionService`, so transaction detection should be client-specific rather than relying on a global transaction service.
- `effect-qb` already has dialect-specific generated SQLSTATE error classes, including Postgres `UniqueViolationError`; the built-in v4 SQL drivers now provide a cross-dialect `UniqueViolation` reason with a `constraint` field.

Recommendation:

1. Replace imports with `effect/unstable/sql/SqlClient` and `effect/unstable/sql/SqlError` when upgrading dependencies.
2. Update `streamFromSqlClient` to use the active client's `transactionService` or the v4 `Statement.stream` API instead of the old `SqlClient.TransactionConnection` global.
3. Expose documented narrowing examples for `SqlError.reason._tag === "UniqueViolation"` so users can distinguish upsert/duplicate-key cases without vendor-specific SQLSTATE handling.
4. Keep dialect-specific known error catalogs for custom drivers and non-`@effect/sql` integrations; do not delete them just because v4 drivers classify common errors.

### P1: Use `SqlSchema` for effect-db introspection and migration ledger reads

v4 adds `effect/unstable/sql/SqlSchema` helpers like `findAll`, `findOne`, `findOneOption`, and `void`. These encode request schemas and decode result schemas around an arbitrary SQL executor.

Where this fits:

- `packages/database/src/internal/postgres-introspector.ts` currently uses typed `sql.unsafe<Row>(...)` interfaces with no runtime row decoding.
- `packages/database/src/postgres/migrate.ts` reads migration ledger rows (`id`, `name`, `checksum`) and then validates checksums manually.

Recommendation:

- Add small internal schemas for introspection rows and migration ledger rows after the v4 migration.
- Use `SqlSchema.findAll` for high-risk introspection queries where a database version or driver transform could silently change a shape.
- Keep AST/source-discovery code independent; `SqlSchema` should validate DB result rows, not replace the source-code model planner.

### P2: Use new Schema codecs as opt-in column/runtime improvements

The changelog adds or stabilizes several Schema codecs that are useful for database boundaries:

- beta.44: `DateFromString`, `BigIntFromString`, `BigDecimalFromString`, `TimeZoneNamedFromString`, `TimeZoneFromString`, `DateTimeZonedFromString`
- beta.44: `StringFromBase64`, `StringFromBase64Url`, `StringFromHex`, `StringFromUriComponent`
- beta.60: `DurationFromString`
- beta.35: `Schema.ArrayEnsure`
- beta.36: `decodeUnknownResult`, `decodeResult`, `encodeUnknownResult`, `encodeResult`

Codebase fit:

- `C.date()`, `C.timestamp()`, `C.timestamptz()`, `C.int8()`, and `C.number()` currently default to canonical string-branded runtime values.
- `README.md` already teaches users to opt into transforms with `C.schema(Schema.DateFromString)`.
- `C.interval()` is currently just `Schema.String`, so `Schema.DurationFromString` could be a useful opt-in or convenience helper.
- `bytea` currently uses a self schema; v4 encoded string codecs may support JSON/API-facing byte helpers without changing the SQL runtime contract.

Recommendation:

- Do not silently change default column decoded types in the v4 migration. That would be a user-facing breaking change separate from the Effect upgrade.
- Add opt-in helpers or documentation recipes after the migration:
  - date/time columns with v4 date/time codecs
  - `int8` with `Schema.BigIntFromString`
  - `numeric` with `Schema.BigDecimalFromString`
  - `interval` with `Schema.DurationFromString`
  - encoded binary JSON payloads with base64/hex codecs

### P2: Preserve richer Schema errors in row decoding

The v4 Schema error model centers on `Schema.SchemaError` and nested `SchemaIssue` trees. It also expands `Schema.makeFilter` output to report nested paths and multiple issues at once.

Current behavior:

- `decodeProjectionValue` checks `Schema.is` and then calls `Schema.decodeUnknownSync` in a `try`/`catch`.
- The catch is stored as `RowDecodeError.cause`, but downstream consumers need to know Effect Schema internals to format it well.

Recommendation:

- After v4 migration, decode via `Schema.decodeUnknownResult` or `Schema.decodeUnknownExit` to avoid exception-shaped control flow.
- Preserve `Schema.SchemaError.issue` explicitly in `RowDecodeError`, or add a formatter that emits a stable path/message representation.
- This is especially useful for JSON columns with nested schemas, where beta.51's richer filter output can give better user-facing validation failures.

### P2: Revisit manual Schema AST inspection around JSON path inference

`packages/querybuilder/src/internal/runtime/schema.ts` manually walks schema AST nodes to infer JSON path result schemas and JSON compatibility. v4 changes enough Schema surface area that this should be treated as a risk area, not just a find-and-replace target.

Relevant v4 changes:

- Schema constructor APIs are array-based in many places.
- Schema representation and JSON Schema output received several fixes, including collapsed same-type literal enums and better `anyOf`/`oneOf` handling.
- beta.51 fixes `SchemaAST.isJson` so DAG-shaped values are not mistaken for cycles.

Recommendation:

- Add focused tests around JSON path narrowing before changing this file.
- Prefer public v4 helpers where available; keep direct AST matching only where there is no public equivalent.
- Re-check union, tuple, and record AST assumptions after the mechanical migration.

### P3: Use v4 CLI/platform packaging to simplify effect-db

`effect-db` currently imports `@effect/cli` and `@effect/platform-bun` directly. v4 moves core CLI/platform functionality into the unified package and keeps platform implementations version-aligned.

Relevant changelog entries:

- beta.44: CLI boolean flags gained canonical `--no-<flag>` negation and optional booleans now distinguish omitted values.
- beta.49: exported CLI completion types were fixed.
- beta.42: CLI help can show concrete choices.
- beta.44 and nearby entries improve prompts and dynamic fallback prompt support.

Recommendation:

- During migration, move CLI imports to the v4 unstable CLI path if that is the supported surface for beta.66.
- After migration, consider adding interactive confirmation for destructive `effectdb push --allow-destructive` or migration rollback paths. Keep non-interactive behavior available for CI.

## Suggested implementation order

1. Create a v4 dependency/import migration branch from `refactor/effect-v4`.
2. Update dependencies to a single observed beta line and remove `@effect/experimental`.
3. Mechanical Schema API migration.
4. Move `VariantSchema` to `effect/unstable/schema/VariantSchema` while preserving `deriveSchemas`.
5. Move SQL imports to `effect/unstable/sql/*` and v4 driver packages; fix transaction/stream handling with the v4 client transaction service.
6. Run `bun run test:types`, `bun test`, and a focused integration pass if Docker/Postgres is available.
7. Only then add functionality improvements: `SqlSchema` for introspection rows, opt-in column codecs, and better `RowDecodeError` formatting.

## Open questions before implementation

- Should `effect-qb` publish a v4-only major/beta, or maintain an Effect 3 compatibility line?
- Do we want public APIs that import from `effect/unstable/*`, or should unstable imports stay internal until Effect v4 stabilizes?
- Should default temporal/numeric column decoded types remain canonical strings in the next release? The safe answer is yes, with new opt-in helpers for richer v4 codecs.
- Should SQL driver peer dependencies be optional per dialect package, or should `effect-qb` keep all v4 SQL driver packages in the workspace dev dependency set for integration coverage?
