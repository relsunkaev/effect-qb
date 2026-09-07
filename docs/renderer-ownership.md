# Renderer ownership

The internal `SqlDialect` remains the dispatch boundary. Public renderer APIs
and dialect capability checks are unchanged.

Shared rendering now owns:

- source-name and column-casing maps in `dialect-renderers/source-context.ts`;
- common scalar AST traversal and driver context in `common-expression.ts`;
- SELECT body clauses, projection rendering and nested state in `common-query.ts`;
- JSON AST path extraction, validation and path-segment grammar in `json/renderer.ts`.

Nested expressions and subqueries call the selected dialect's existing hooks.
SELECT source references use its `renderSourceReference` method, so derived
sources, CTEs, VALUES, UNNEST and table functions keep their concrete lowering.
A shared clause builder does not substitute a different engine's source syntax.

Concrete renderers still own full statement forms, DDL, JSON operators, casts,
numeric coercion, locking and capability-specific errors. PostgreSQL DISTINCT
ON validation and standard/MySQL full-join rejection remain concrete checks.
The shared SELECT body does not decide which joins or locks an engine supports.

This is not a claim that all SQL strings occur only once. Where lowering differs,
keeping it at the dialect boundary is preferable to a general callback registry
or policy flags scattered through a universal renderer.

Verification includes 80 SQL/parameter snapshots captured before extraction,
existing query/source/casing/JSON behavior tests, full public type tests, packed
Node consumer checks, and the complete PostgreSQL/MySQL/SQLite integration suite.
The extraction removes 848 net lines from the renderer implementation paths,
including the new shared JSON renderer helpers in that count.
