# Effect v4 schema optics evaluation

Checked on 2026-05-13 against `effect@4.0.0-beta.66`.

## Verdict

Effect v4 optics are useful for us, but not as a direct replacement for the existing table schema derivation or JSON path machinery.

They are strongest as an optional ergonomics layer for value-level nested access and update APIs, and potentially as inspiration for a typed JSON-path builder. They should not be used as the core representation for SQL JSON paths unless Effect exposes a stable path representation; the current `Optic` runtime node is an implementation detail, and several optic operations do not map cleanly to SQL JSON operators.

## Upstream surface

Primary sources inspected:

- `effect@4.0.0-beta.66` npm package declarations and source tarball
- Effect release tag: <https://github.com/Effect-TS/effect-smol/releases/tag/effect%404.0.0-beta.66>
- Effect changelog: <https://raw.githubusercontent.com/Effect-TS/effect-smol/main/packages/effect/CHANGELOG.md>

Observed API shape:

- `effect` exports `Optic` from the top-level package.
- `Schema.Optic<T, Iso>` extends `Schema<T>` for schemas whose decode and encode services are both `never`.
- `Schema.toIso(schema)`, `Schema.toIsoSource(schema)`, and `Schema.toIsoFocus(schema)` bridge schemas into optic isomorphisms.
- `Optic.id<T>()` supports typed chains with `.key(...)`, `.optionalKey(...)`, `.at(...)`, `.tag(...)`, `.refine(...)`, `.check(...)`, `.pick(...)`, `.omit(...)`, `.notUndefined()`, `.forEach(...)`, `.modify(...)`, `.replace(...)`, and `replaceResult(...)`.
- The changelog currently does not call out optics/lenses as a beta-specific changelog item, so this is a v4 surface-area evaluation rather than a changelog-highlighted feature.

## Fit against our codebase

### Useful: user-facing typed nested value helpers

Optics would give users an Effect-native way to work with decoded nested values from `C.json(...)`, `C.jsonb(...)`, and selected row objects.

Example shape:

```ts
import { Optic } from "effect"

type Profile = {
  readonly address: {
    readonly city: string
  }
}

const city = Optic.id<Profile>().key("address").key("city")
const next = city.replace("Phoenix", profile)
```

This fits our decoded-row story, where `packages/querybuilder/src/internal/executor.ts` already normalizes driver values and decodes them through Effect Schema. It also fits the existing README direction around `C.schema(...)` transforms.

Recommendation: document this after the v4 migration as a value-level companion pattern. It does not require new `effect-qb` APIs.

### Possibly useful: an optic-like JSON path builder

Our JSON path API already has strong type-level path evaluation:

- `packages/querybuilder/src/internal/json/path.ts` defines typed key/index/wildcard/slice/descend segments.
- `packages/querybuilder/src/internal/json/types.ts` computes `JsonValueAtPath`, `JsonSetAtPath`, `JsonDeleteAtPath`, and `JsonInsertAtPath`.
- `packages/querybuilder/src/postgres/json.ts` maps those path types into SQL expression result types.

Effect `Optic` overlaps with the ergonomic part of this:

```ts
Optic.id<Payload>().key("profile").key("address").key("city")
```

That style is nicer than:

```ts
Pg.Json.path(
  Pg.Json.key("profile"),
  Pg.Json.key("address"),
  Pg.Json.key("city")
)
```

But we should not directly consume Effect optic internals to render SQL. `Optic` has a public `node` property in the declaration, but its node union is not exported as a stable API. It also includes operations like `.check(...)`, `.refine(...)`, `.tag(...)`, `.pick(...)`, `.omit(...)`, and `.forEach(...)`; only a small subset has an obvious SQL JSON path equivalent.

Recommendation: if we want this ergonomic shape, build our own `JsonPath.lens<T>()` or `JsonPath.focus<T>()` API with an optic-like method chain that emits our existing `JsonPath.Path` segments. Keep it separate from Effect `Optic` unless Effect exposes a stable serializer for path-only optics.

Potential API:

```ts
const city = Pg.Json.focus<Profile>()
  .key("address")
  .key("city")
  .path

Pg.Json.jsonb.get(users.profile, city)
```

This would preserve our SQL-specific semantics: JSON null behavior, missing-key behavior, tuple index handling, wildcard/slice/descend support for jsonb traversal, `jsonb_set` create-missing behavior, and our typed usage errors.

### Not useful as a replacement for table schema derivation

`packages/querybuilder/src/internal/schema-derivation.ts` derives `select`, `insert`, and `update` schemas from column metadata: generated columns, defaults, nullable columns, primary keys, and brands.

Effect optics can pick or omit object keys, but they do not know our column metadata. They do not replace:

- omitting generated columns from insert/update
- making nullable/defaulted insert fields optional
- omitting primary keys from update payloads
- preserving `table.column` brands

Recommendation: keep the v4 migration plan focused on `effect/unstable/schema/VariantSchema` or eventually `effect/unstable/schema/Model`; optics are not the right primitive for this layer.

### Not useful as a replacement for runtime schema inference

`packages/querybuilder/src/internal/runtime/schema.ts` currently walks Schema ASTs to infer result schemas for exact JSON paths. Optics can express nested access at the TypeScript value level, but they do not expose the focused Effect Schema for a path. They also do not cover our SQL expression cases like `case`, `coalesce`, casts, aggregate/window functions, and SQL JSON constructors.

Recommendation: do not replace `expressionRuntimeSchema(...)` with optics. After the v4 migration, prefer public v4 Schema helpers where they exist, but keep direct SQL-expression schema inference local to `effect-qb`.

### Not useful for row decode errors

Optics can focus values after decoding, but our row decode errors need decode/validation issue detail. The v4 Schema error model and `Schema.decodeUnknownResult` are the better improvement path for `RowDecodeError`.

Recommendation: keep the row-decode follow-up from the broader v4 opportunity map: preserve `Schema.SchemaError.issue` or format `SchemaIssue` paths. Optics do not materially improve this failure mode.

## Recommended next step

Do not add Effect `Optic` usage during the mechanical v4 migration.

After the migration is green, add one small design spike for JSON path ergonomics:

1. Prototype an internal `JsonPath.focus<T>()` builder with `.key(...)`, `.optionalKey(...)`, `.index(...)`, `.wildcard()`, `.slice(...)`, and `.descend()`.
2. Make it emit the existing `JsonPath.Path` structure.
3. Compare type output and usage errors against the existing `Pg.Json.path(...)` API.
4. If it improves call-site readability without weakening SQL semantics, expose it as an additive API.

Net: Effect v4 optics are worth documenting for decoded values and worth borrowing from for API ergonomics. They are not a foundation to replace our schema derivation, runtime schema inference, or SQL JSON path representation.
