# Datatype implementation ownership

The root `effect-qb` namespace owns portable type witnesses. Matching SQL type
names alone do not make concrete types portable.

| Concern | Owner | Boundary |
| --- | --- | --- |
| Portable kind/family metadata | `internal/datatypes/matrix.ts` portable records | Root `Type` exposes this contract; concrete modules do not widen it. |
| Concrete metadata | The same matrix's PostgreSQL/MySQL/SQLite records | Engine-specific families, cast targets and runtime tags remain separate. |
| Witness construction | `internal/datatypes/define.ts` | Builds fresh descriptors from those records; adds no SQL or conversion policy. |
| Native aliases and JSON wrappers | Concrete `datatypes/index.ts` modules | PostgreSQL bool alias and JSON/JSONB variants remain local. |
| Portable SQL type spelling | Matrix DDL/cast tables and dialect renderers | Storage spelling and expression CAST syntax are distinct. |
| Driver encoding and decoding | Runtime value mapping and dialect assembly | A TypeScript result type is not a promise of identical engine storage. |

The four datatype modules previously repeated the same kind/family lookup and
constructor loop. They now use `makeDatatypeModule` beside the existing
`DatatypeModule` type. Concrete modules apply their existing additions to the
result. There is no new public registration API, fallback registry or runtime
capability discovery.

## Semantics deliberately kept separate

- UUID is a native PostgreSQL type, but the portable contract maps it to
  character storage in MySQL and text in SQLite. Their local UUID descriptors
  are emulation metadata, not new native kinds.
- Exact numeric witnesses decode to branded strings. MySQL DECIMAL defaults and
  SQLite affinity do not provide PostgreSQL numeric precision semantics.
- MySQL integer kinds belong to its numeric family; SQLite distinguishes an
  integer family. Shared spelling is not grounds for merging their rules.
- Standard and SQLite JSON witnesses stringify primitive values too. The
  existing MySQL JSON mapping stringifies structured values only. PostgreSQL
  distinguishes JSON and JSONB descriptors and uses its driver mapping path.
- Date/time, binary and engine-specific container kinds retain their matrix
  entries and dialect rendering. PostgreSQL arrays, ranges, domains and enums
  do not become portable through this construction helper.
- Custom witnesses contain only the caller's dialect/kind assertion. The
  permissive cast policy audit remains `effect-qb-ugi`; this refactor does not
  validate custom server types or change accepted cast pairs.

The ordinary datatype matrix tests cover root witness DDL and casts in all
renderers. Additional tests cover custom metadata, integer-family differences,
PostgreSQL aliases and JSON serialization. Full typechecks and packed root
consumer checks protect the existing public boundary. No standard subpath
export is added.
