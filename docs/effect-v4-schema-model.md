# Effect v4 Schema Model Evaluation

Decision: keep the existing table DSL on `effect/unstable/schema/VariantSchema` for the v4 migration. Do not replace `deriveSchemas(...)` with `effect/unstable/schema/Model` in this branch.

`Model` is still worth tracking for a future model-first API, but it is broader than a safe migration of the current column/table system.

## What Model Provides

`effect/unstable/schema/Model` wraps `VariantSchema.make(...)` with the variants:

- `select`
- `insert`
- `update`
- `json`
- `jsonCreate`
- `jsonUpdate`

It also provides field helpers:

- `Generated(schema)`: present in `select`, `update`, and `json`, omitted from `insert`.
- `GeneratedByApp(schema)`: present in database variants, omitted from JSON create/update variants.
- `Sensitive(schema)`: present in database variants, omitted from JSON variants.
- `FieldOption(schema)`: database variants decode `null`/value into `Option`, JSON variants also allow missing keys.
- Date/time helpers such as `DateTimeInsertFromDate` and `DateTimeUpdateFromDate`.
- `JsonFromString(schema)` for text-backed JSON columns with JSON API variants.

Those are good primitives for domain models and DTO variants.

## Current effect-qb Contract

The current table DSL is not only a schema derivation layer. A column carries:

- runtime schemas for select/insert/update derivation
- SQL dialect and DB type metadata
- nullability, defaults, generated columns, identity, primary keys, unique/index metadata, references, DDL type overrides, driver value mappings, and dependency metadata
- bound-column provenance used by query planning and rendering

`deriveSchemas(...)` is deliberately a narrow adapter from that column metadata to three schema variants:

- select: all columns, nullable columns as `T | null`
- insert: generated columns omitted; nullable/default columns optional
- update: generated and primary-key columns omitted; remaining columns optional

## Mismatch With Model Helpers

`Model.Generated(schema)` does not match effect-qb generated columns. It omits `insert`, but keeps `update`; effect-qb generated columns are omitted from both insert and update.

`Model.FieldOption(schema)` does not match nullable columns. It decodes database variants to `Option`, while effect-qb's public table schemas currently expose nullable database values as `T | null` and use optional object properties only for insert/update shapes.

`Model.Sensitive(schema)` has no current effect-qb column metadata equivalent. It is useful for API JSON variants, but this migration does not add JSON DTO variants to tables.

The date/time helpers encode application-default behavior. effect-qb currently distinguishes SQL defaults and generated expressions in DDL metadata, and does not synthesize application defaults during schema decoding.

## Prototype Shape

A future model-first API would likely need a metadata wrapper around Model fields instead of directly replacing columns:

```ts
import * as Schema from "effect/Schema"
import * as Model from "effect/unstable/schema/Model"

const UserId = Schema.String.check(Schema.isUUID()).pipe(Schema.brand("users.id"))

class User extends Model.Class<User>("User")({
  // effect-qb generated columns need a custom field shape because Model.Generated
  // still exposes the field in update variants.
  id: Model.Field({
    select: UserId,
    json: UserId
  }),

  email: Schema.String,

  // Nullable SQL columns would need a compatibility choice:
  // keep T | null to match current tables, or introduce Option in a new API.
  nickname: Model.Field({
    select: Schema.NullOr(Schema.String),
    insert: Schema.optional(Schema.NullOr(Schema.String)),
    update: Schema.optional(Schema.NullOr(Schema.String)),
    json: Schema.optional(Schema.String)
  }),

  // Sensitive JSON omission maps well, but only after tables have explicit
  // JSON DTO variants.
  passwordHash: Model.Sensitive(Schema.String)
}) {}
```

That class still does not carry DB type, index, reference, default, generated-expression, identity, or dialect metadata. A model-first table API would need an additional column metadata layer around each field, plus a strategy for preserving bound-column/query-planning state.

## Recommendation

For this branch:

- Keep `packages/querybuilder/src/internal/schema-derivation.ts` on v4 `VariantSchema`.
- Keep existing `select`/`insert`/`update` decoded types unchanged.
- Do not add Model to the runtime dependency surface beyond the existing `effect` package.

For a future branch:

- Prototype a separate model-first API instead of mutating `Table.make(...)`.
- Treat `json`, `jsonCreate`, and `jsonUpdate` as an additive DTO feature.
- Decide explicitly whether nullable SQL fields remain `T | null` or move to `Option` in that new API.
- Add a custom generated-column helper that omits both `insert` and `update`.
