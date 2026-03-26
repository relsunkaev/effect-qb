# Changelog

All notable changes to this project are documented here.

## Unreleased

## 0.14.0 - 2026-03-26

### Breaking Changes

- feat(postgres)!: replace schema-management namespace with Pg.schema
- fix(database)!: remove legacy effect-db alias
- fix(database)!: remove legacy cli export and canonicalize builtin postgres types
- feat(querybuilder)!: add pipeable unique options and jsonb variants
- feat(postgres)!: move casts and db types into dedicated namespaces

### Features

- feat: add postgres schema introspection and migration CLI
- feat(database): add rename-aware schema sync and migration lifecycle
- feat(database): rename cli to effectdb
- feat(querybuilder): add ddl query builders
- feat(querybuilder): add first-class postgres scalar constructors
- feat(querybuilder): add sized postgres char and varchar constructors
- feat(querybuilder): add array column constructors
- feat(querybuilder): support nullable array elements
- feat(querybuilder): add implication-aware predicate reasoning
- feat(database): inline single-column constraints in pulled schemas
- feat(querybuilder): add bound column branding
- feat(querybuilder): specialize dialect query implementations
- feat(querybuilder): preserve inline column brands in table schemas
- feat(postgres): support table-scoped check and index predicates
- feat(postgres): expose json.delete on plain json values

### Fixes

- fix(postgres-cli): preserve exported tables during discovery
- fix(cli): ignore managed migration tables during postgres sync
- fix(postgres-cli): recognize class table declarations during discovery
- fix(postgres-cli): reject unsupported postgres index operator classes
- fix(postgres-cli): reject unsupported postgres index collations
- fix(postgres-cli): introspect postgres nulls-not-distinct uniques
- fix(postgres-cli): allow class pulls to inline default primary keys
- fix(postgres-cli): reject non-canonical source discovery shapes
- fix(postgres-cli): apply source filters during schema sync
- fix(types): accept full query plans in renderers and executors
- fix(release): fallback missing changelog section labels
- fix(database): round-trip jsonb columns and fk-heavy pulls
- fix(database): use canonical import names in pulled schemas
- fix(database): normalize ddl expression comparisons
- fix(database): normalize postgres builtin scalar types
- fix(database): round-trip sized postgres char and varchar columns
- fix(workspace): repoint package aliases after monorepo split
- fix(database): emit configured numeric columns during pull
- fix(database): preserve pulled postgres default and jsonb predicate types
- fix(query): correct join nullability narrowing
- fix(querybuilder): preserve schema-scoped sequences in nextVal
- fix(database): canonicalize quoted array builtin types
- fix(database): order pulled tables by dependency

### Refactors

- refactor: move sql qb sources into packages layout
- refactor(database): split postgres schema commands into public modules
- refactor(querybuilder): simplify boolean normalization helpers
- refactor(querybuilder): streamline predicate context analysis

### Docs

- docs(workspace): refresh root README for monorepo layout
- docs(readme): expand implication-aware examples
- docs(readme): add shared example schema for docs
- docs(readme): inline example setup in snippets
- docs(readme): refresh README examples and references
- docs(readme): tighten quick-start example
- docs(readme): improve flow and implication examples
- docs(readme): document postgres namespaces and column branding

### Tests

- test(integration): add live postgres cli workflow coverage
- test(postgres-cli): cover destructive pushes and source mismatch failures
- test(postgres-cli): cover discovery shapes and migration edge cases
- test(postgres-cli): cover rich postgres schema round-trips
- test(postgres-cli): cover unsupported postgres index collations
- test(postgres-cli): cover composite foreign keys and nulls-not-distinct uniques
- test(postgres-cli): cover enum and check-expression pull failures
- test(postgres-cli): cover pull rewrites and expression failures
- test(postgres-cli): cover safe mode drift and pull idempotence
- test(postgres-cli): cover destructive migration generation
- test(postgres-cli): cover config errors, scoping, and enum drift
- test(types): align runtime suites with repo-wide tsgo
- test(database): cover rename-aware sync and migration lifecycle
- test(database): update canonical ddl builder coverage
- test(database): cover builtin postgres scalar round-trips
- test(database): stabilize postgres cli integration fixtures
- test(public): realign json mutation expectation
- test(querybuilder): simplify standalone expression type assertions
- test(querybuilder): relax source availability assertions
- test(querybuilder): refresh branding and cross-cutting fixtures
- test(querybuilder): update json delete docs example
- test(postgres-cli): relax brittle pull round-trip assertions
- test(types): fix json mutation expect-error placement

### CI

- ci: build before running tests in github actions
- ci: publish workspace packages from package dirs
- ci: publish only on tag pushes

## 0.13.0 - 2026-03-23

### Breaking Changes

- feat(api)!: move json helpers under Function namespaces
- feat(api)!: move scalar helpers under Function namespaces
- feat(column)!: require expressions for default and generated
- fix(table)!: require expressions for check constraints

### Fixes

- fix(release): use personal git identity
- fix(release): fall back to release commits when tags are missing

### Docs

- docs(readme): add postgres functions and defaults note
- docs(readme): add shaping results imports
- docs(readme): restructure intro and refresh examples
- docs(readme): document table options and check constraints

## 0.12.3 - 2026-03-21

### Breaking Changes

- feat(query)!: add schema-free implication typing and derived tables
- feat(query)!: add dialect-aware coercion guards for operators
- feat(table)!: split postgres and mysql table namespaces
- feat(query)!: replace insert helpers with composable values sources
- feat(query)!: remove insertUnnest helper
- feat(api)!: remove root exports in favor of dialect entrypoints
- feat(api)!: move shared core modules into internal
- refactor(api)!: rename dialect modules to lowercase
- feat(api)!: remove root export map
- feat(query)!: simplify insert source composition
- feat(executor)!: simplify dialect executor construction
- feat(runtime)!: normalize executor outputs and enforce runtime schemas
- feat(query)!: replace hasDefault with default helper

### Features

- feat(mysql): add mysql errors and rename modules snake_case
- feat(query): add read predicate builders and rendering
- feat(query): add common table expressions
- feat(query): add mutation statements and returning
- feat(query): add pagination, set ops, joins, windows, and ddl
- feat(query): add correlated sources and statement clauses
- feat(query): add data-modifying ctes and transaction helper
- feat(executor): add savepoint helper
- feat(query): add remaining read predicates and simple case
- feat(query): expand dialect datatype witnesses and runtime mapping
- feat(datatypes): model broader dialect catalogs
- feat(datatypes): model structured types and coercion
- feat(json): add postgres json operators and typed manipulation
- feat(table): add schema-qualified table namespaces
- feat(query): add truncate merge and transaction statements
- feat(query): add insert sources and conflict helpers
- feat(query): add standalone sources and quantified subqueries
- feat(query): add distinct on support
- feat(query): add curried aliases and preserve literal outputs
- feat(query): add curried cte source helpers
- feat(postgres): add function namespace for typed SQL expressions
- feat(release): use changelog section as GitHub release body

### Fixes

- fix(integration): run Bun tests by explicit path
- fix(integration): extend live database timeouts

### Refactors

- refactor(datatypes): derive coercion from family specs
- refactor(predicate): rewrite implication analysis around a stack walk
- refactor(modules): use js-relative specifiers across source files
- refactor(modules): split public and internal surfaces

### Docs

- docs: expand README with type-safety and query return examples
- docs(readme): document derived tables and type-driven queries
- docs(readme): document extended read predicates
- docs(readme): document common table expressions
- docs(readme): document pagination, set ops, joins, windows, and ddl
- docs(readme): document correlated sources and statement clauses
- docs(readme): document data-modifying ctes and transactions
- docs(readme): restructure guide around type safety
- docs: add AGENTS instructions
- docs(readme): add semantic SQL hook and native-preview commands
- docs(readme): update package layout docs
- docs(readme): strengthen proof-oriented examples
- docs(readme): align examples with the new query surface
- docs(readme): show dialect mismatch at executor boundary
- docs(readme): fix json mutation example semantics
- docs(readme): make predicate narrowing example self-contained
- docs(readme): use pipe style in mutation examples
- docs(readme): document onboarding and error handling
- docs(readme): refresh schema integration and package usage
- docs(readme): use pipe style in returning examples
- docs(readme): align guide examples with current query api
- docs(readme): add npm install commands

### Tests

- test(mutations): cover json mutation compatibility
- test(json): add exact mutation render coverage
- test: harden json and type coverage
- test: split query coverage and centralize assertions
- test(json): add reusable path object coverage
- test(integration): add docker-backed database coverage

### Build

- build(package): define npm publish layout for 0.12.3

### CI

- ci: add github actions workflow for tests and build

### Chores

- chore(types): switch typecheck to tsgo and trim depth-heavy tests

### Other

- Bootstrap effect-db with typed SQL core and dialect renderers
- Rename package to effect-qb and tighten query type semantics
- Implement predicate analysis and Postgres error normalization

