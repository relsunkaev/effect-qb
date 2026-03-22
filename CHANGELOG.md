# Changelog

All notable changes to this project are documented here.

## Unreleased

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

