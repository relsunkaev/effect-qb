# Query DSL implementation ownership

Root `effect-qb` remains the portable query API. Concrete query extensions keep
their existing restricted exports; this refactor restores no legacy helpers to
those namespaces.

The implementation inventory found four existing shared runtime owners:
`dsl-query-runtime.ts`, `dsl-plan-runtime.ts`, `dsl-mutation-runtime.ts` and
`dsl-transaction-ddl-runtime.ts`. Concrete DSL files already use them. Adding
another generic query factory would duplicate those owners and widen the
configuration surface without simplifying the public caller.

The completed shared slice is literal and unqualified-column construction.
`dsl-literal.ts` now owns the existing profile contract, literal result-type
mapping, literal schema derivation, and both constructors. Each DSL passes its
existing profile or dialect directly. There is no new callback configuration,
retagging pass or parallel query runtime.

The representative public caller is a dialect string function such as
`Pg.Function.lower("MiXeD")`. Its internal literal is built by the shared
constructor; the result still renders with PostgreSQL parameters and retains
its dialect typing. Equivalent MySQL and SQLite callers are tested too.
Root literal and column behavior uses the same constructor boundary.

Null literals retain always-null metadata. Dates and non-finite numbers do not
acquire a literal schema. Non-finite numeric rejection stays at rendering, not
at construction. Column witnesses and runtime nullability remain unchanged.

Dialect-specialized type facades remain local. Further extraction must preserve
inference cost and dialect-specific JSON/mutation rules. The shared constructors
do not introduce another configurable query factory or change the public grammar.
