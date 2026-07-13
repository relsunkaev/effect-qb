# Changelog

All notable changes to this project are documented here.

## Unreleased

### Fixes

- fix(database): canonicalize int and dec/decimal postgres type aliases
- fix(querybuilder): skip runtime literal schemas for non-finite numbers so renderers report them
- fix(querybuilder): unwrap effect sql error reason wrappers when normalizing driver errors

### Other

- test: repair stale suite for effect 4.0.0-beta.92
- ci: smoke test current package entrypoints

## 4.0.0-beta.92 - 2026-06-30

### Chores

- chore(beads): record beta release publish blocker
- chore(effect): update beta dependencies to beta.92
- chore(beads): track beta.92 release

## 4.0.0-beta.67 - 2026-06-30

### Breaking Changes

- feat(querybuilder)!: remove renderer make casing option
- feat(querybuilder)!: require callback table options
- feat(querybuilder)!: add path-aware JSON traversal
- feat(querybuilder)!: remove JSON asText aliases
- feat(querybuilder)!: consolidate cast surface
- feat(querybuilder)!: separate standard and dialect type helpers
- feat(querybuilder)!: remove executor withSavepoint helper

### Features

- feat: validate effect-db sql rows with SqlSchema
- feat: preserve schema issues in row decode errors
- feat(querybuilder): add table option namespaces
- feat(querybuilder): consolidate dialect helper exports
- feat(querybuilder): support row-local check callbacks
- feat(querybuilder): type-check conflict arbiters
- feat(querybuilder): enforce datatype matrix coverage

### Fixes

- fix: preserve json path schema transforms
- fix(database): emit package declarations
- fix(querybuilder): allow schema-backed jsonb scalar casts
- fix(querybuilder): render portable mysql datatypes as executable SQL
- fix(querybuilder): stabilize curried Cast.to inference; bump tsgo

### Docs

- docs: cover opt-in Effect v4 schema codecs
- docs: record schema model migration decision
- docs: remove broken database beta guidance
- docs: update jsonb readme examples
- docs(readme): clarify type and json examples
- docs(readme): document json paths and cast type safety
- docs(readme): document conflict target type safety
- docs(readme): restructure code examples for clarity
- docs(readme): rewrite casting example, showcase more query features
- docs(readme): sharpen example salience
- docs(readme): show scoped executor transactions

### CI

- ci: add beta package deprecation path

### Chores

- chore: migrate Effect dependency surface to v4 beta
- chore(release): prepare beta channel
- chore(release): v4.0.0-beta.66
- chore(beads): close readme check callback task
- chore(beads): record JSON type-safety epic
- chore: track @typescript/native-preview via the beta tag
- chore(beads): track effect v4 merge
- chore(beads): track v4 beta release

### Other

- bd init: initialize beads issue tracking
- Add datatype matrix coverage tests

## 0.19.0 - 2026-05-27

### Breaking Changes

- feat(querybuilder)!: remove portable helpers from dialect namespaces

### Features

- feat(querybuilder): expose flat json helper modules
- feat(querybuilder): add casing shorthand and dialect query extensions

### Docs

- docs(readme): show json schema safety examples
- docs(readme): simplify type safety examples

### Tests

- test(dialects): cover standard helper import boundary

### CI

- ci(publish): publish querybuilder with npm
- ci(release): configure release git author

### Chores

- chore(beads): track npm publish blocker
- chore(beads): narrow npm publish blocker
- chore(release): allow workspace publish
- chore(beads): track dialect namespace cleanup
- chore(beads): close dialect namespace cleanup
- chore(beads): track v0.19.0 release

## 0.18.0 - 2026-05-26

### Breaking Changes

- feat(querybuilder)!: remove table schema factories

### Features

- feat: derive table schemas lazily
- feat(querybuilder): introduce standard dialect entrypoint
- feat(querybuilder): extract standard query DSL
- feat(querybuilder): add portable standard column types
- feat(querybuilder): expose standard dialect from package root
- feat(querybuilder): add composable identifier casing
- feat(querybuilder): add postgres schema composition
- feat(querybuilder): make dialect surfaces extension-only

### Fixes

- fix(querybuilder): reject mixed concrete standard plans
- fix(querybuilder): guard untyped mixed dialect plans
- fix(querybuilder): guard untyped mixed dialect executors
- fix(querybuilder): rename root standard namespace to sql
- fix(querybuilder): type renderer value mapping keys
- fix(querybuilder): remove root sql namespace
- fix(database): discover schema make factories
- fix(querybuilder): render cased foreign key targets
- fix(querybuilder): apply casing in mysql and sqlite renderers
- fix(querybuilder): apply casing in mysql and sqlite ddl
- fix(querybuilder): apply table casing to postgres ddl names
- fix(postgres): model cased schema identifiers
- fix(querybuilder): apply casing to mutation columns
- fix(querybuilder): apply casing to generated ddl expressions
- fix(mysql): apply casing to delete target lists
- fix(querybuilder): apply casing to update assignments
- fix(querybuilder): preserve query-local source casing
- fix(querybuilder): preserve casing in nested renderers
- fix(querybuilder): reject malformed between predicates
- fix(querybuilder): reject malformed coalesce expressions
- fix(querybuilder): reject malformed concat expressions
- fix(querybuilder): reject malformed boolean combinators
- fix(querybuilder): reject malformed membership predicates
- fix(querybuilder): reject malformed case expressions
- fix(querybuilder): reject case expressions without fallback
- fix(querybuilder): reject incomplete case branches
- fix(querybuilder): reject window over without aggregate
- fix(querybuilder): reject invalid window order directions
- fix(querybuilder): reject window order terms without values
- fix(querybuilder): reject window partition terms without values
- fix(querybuilder): reject invalid quantified operators
- fix(querybuilder): reject malformed collations
- fix(querybuilder): reject current date arguments
- fix(querybuilder): reject malformed extract calls
- fix(querybuilder): reject empty function names
- fix(querybuilder): reject malformed function arguments
- fix(querybuilder): reject malformed case branches
- fix(querybuilder): reject malformed window clauses
- fix(querybuilder): reject malformed cast targets
- fix(querybuilder): reject malformed variadic values
- fix(querybuilder): reject malformed json builders
- fix(querybuilder): reject malformed json builder entries
- fix(querybuilder): reject malformed json key predicates
- fix(querybuilder): reject empty sql json paths
- fix(querybuilder): reject mysql json wildcard mutations
- fix(mysql): use standard tables in integration coverage
- fix(integration): use standard tables in dialect suites
- fix(querybuilder): reject malformed unary expressions
- fix(querybuilder): reject malformed binary expressions
- fix(querybuilder): reject malformed grouped casts
- fix(querybuilder): reject malformed cast operands
- fix(querybuilder): reject malformed collate operands
- fix(querybuilder): reject malformed function arguments
- fix(querybuilder): reject malformed function names
- fix(querybuilder): reject malformed grouped variadics
- fix(querybuilder): reject malformed grouped case expressions
- fix(querybuilder): reject malformed subquery operands
- fix(querybuilder): reject malformed grouped json expressions
- fix(querybuilder): reject malformed json path segments
- fix(querybuilder): reject grouped invalid date literals
- fix(querybuilder): reject invalid date predicates
- fix(querybuilder): reject invalid date normalization
- fix(querybuilder): reject invalid date ddl defaults
- fix(querybuilder): reject malformed plan clauses
- fix(querybuilder): reject malformed optional plan arrays
- fix(querybuilder): reject malformed mutation column arrays
- fix(querybuilder): reject malformed unnest insert metadata
- fix(querybuilder): reject malformed insert target metadata
- fix(querybuilder): reject malformed ddl table options
- fix(querybuilder): reject malformed ddl option entries
- fix(querybuilder): reject malformed ddl check constraints
- fix(querybuilder): validate schema model table options
- fix(querybuilder): reject unknown schema table options
- fix(querybuilder): validate schema index key metadata
- fix(querybuilder): reject non-array table options
- fix(querybuilder): validate foreign key reference identifiers
- fix(querybuilder): validate table option names
- fix(querybuilder): validate index support identifiers
- fix(querybuilder): validate table option boolean flags
- fix(querybuilder): validate row lock flags
- fix(querybuilder): validate statement option flags
- fix(querybuilder): validate statement identifiers
- fix(querybuilder): validate conflict constraint names
- fix(querybuilder): validate conflict target columns
- fix(postgres): apply schema casing to enum and sequence namespaces
- fix(ddl): reject postgres-only check options outside postgres
- fix(ddl): reject unsupported deferrable constraints
- fix(standard): reject non-portable constraint options
- fix(ddl): reject unsupported identity columns
- fix(standard): reject identity column metadata
- fix(ddl): reject unsupported array columns
- fix(mutation): reject invalid conflict predicates
- fix(mutation): reject unsupported conflict targets
- fix(query): reject conflicting lock wait modes
- fix(query): reject ungrouped having predicates
- fix(query): reject ungrouped order terms
- fix(postgres): reject invalid distinct on ordering
- fix(standard): reject unsupported index existence modifiers
- fix(standard): reject unsupported table existence modifiers
- fix(standard): reject regex predicates
- fix(standard): reject mutation returning
- fix(standard): reject insert conflict clauses
- fix(renderer): reject excluded outside conflicts
- fix(standard): reject joined mutations
- fix(standard): reject row locking
- fix(standard): reject truncate statements
- fix(standard): reject full joins
- fix(standard): reject lateral sources
- fix(standard): reject quantified comparisons
- fix(standard): reject non-union set all variants
- fix(querybuilder): validate rendered function identifiers
- fix(querybuilder): validate table function identifiers
- fix(querybuilder): reject empty SQL identifiers
- fix(querybuilder): reject empty db type names
- fix(querybuilder): validate DDL type overrides
- fix(querybuilder): reject empty table names in types
- fix(querybuilder): reject empty identifier factories in types
- fix(querybuilder): reject empty table field names in types
- fix(querybuilder): type casing pipe targets
- fix(querybuilder): reject empty class table names in types
- fix(querybuilder): reject empty direct table schema names in types
- fix(querybuilder): reject empty table option names in types
- fix(querybuilder): reject empty postgres index metadata in types
- fix(querybuilder): reject empty inline column metadata in types
- fix(querybuilder): require literal aliases in types
- fix(querybuilder): trust typed projections in built-in renderers
- fix(querybuilder): reject empty json path strings in types
- fix(querybuilder): reject empty db type names in types
- fix(querybuilder): reject empty conflict constraint names in types
- fix(querybuilder): reject unsafe function identifiers in types
- fix(querybuilder): reject malformed function calls in types
- fix(querybuilder): reject empty statement and index names in types
- fix(querybuilder): support direct foreign-key reference payloads in renderers
- fix(querybuilder): support direct foreign-key reference payloads in schema models
- fix(querybuilder): handle empty index key arrays in schema mapping
- fix(querybuilder): handle empty option columns under casing in schema mapping
- fix(querybuilder): tolerate non-string option names under casing
- fix(querybuilder): tolerate non-string foreign-key identifiers under casing
- fix(querybuilder): allow non-object foreign-key reference targets
- fix(querybuilder): tolerate malformed index predicates in schema mapping
- fix(querybuilder): preserve malformed foreign-key reference columns
- fix(querybuilder): trust foreign-key local column metadata
- fix(querybuilder): trust malformed non-index option columns
- fix(querybuilder): trust malformed index option columns
- fix(querybuilder): preserve unknown table option kinds
- fix(querybuilder): trust malformed table option entries
- fix(querybuilder): normalize non-array table option metadata
- fix(querybuilder): avoid malformed primary key option crashes
- fix(querybuilder): trust conflicting primary key metadata
- fix(querybuilder): handle malformed index key metadata
- fix(querybuilder): ignore malformed option entries during ddl rendering
- fix(querybuilder): normalize non-array table options in ddl renderers
- fix(database): ignore malformed table options in postgres schema diff
- fix(database): ignore malformed options in postgres create-table sql
- fix(querybuilder): preserve malformed index keys in source table models
- fix(database): skip malformed index keys in postgres schema planning
- fix(database): normalize malformed index keys in postgres pull planning
- fix(database): harden postgres pull option traversal
- fix(database): guard malformed constraint columns in postgres pull
- fix(database): validate constraint shapes in postgres schema planning
- fix(database): tolerate malformed index include metadata
- fix(database): normalize index include metadata in postgres pull
- fix(database): ignore malformed index predicates in schema planning
- fix(database): skip malformed check predicates in schema planning
- fix(database): validate check predicates in postgres pull planning
- fix(database): tolerate malformed index predicates in postgres pull planning
- fix(database): tolerate malformed postgres index expression metadata
- fix(postgres): type cased schema metadata mappings

### Refactors

- refactor(querybuilder): delegate rendering through sql dialect
- refactor(querybuilder): use postgres schema namespace consistently
- refactor(querybuilder): tighten unnecessary unknown annotations
- refactor(querybuilder): remove unnecessary unknown bridges

### Docs

- docs(readme): document sqlite and jsonb narrowing
- docs(querybuilder): specify standard dialect end state
- docs(readme): add chapter planning notes
- docs(readme): rewrite guide from chapter notes
- docs(readme): organize guide hierarchy
- docs(readme): expand type safety guide
- docs(readme): promote type safety guide
- docs(readme): remove chapter planning notes

### Tests

- test: cover table schema helper surface
- test(querybuilder): cover standard concrete narrowing
- test(querybuilder): cover standard portable query rendering
- test(querybuilder): cover standard mutation rendering
- test(querybuilder): cover postgres schema namespace surface
- test(querybuilder): cover value mapping key surfaces
- test(pack): smoke root table and column imports

### Chores

- chore(repo): map stale release bot identity
- chore(repo): map bare release email
- chore(deps): make effect packages peer dependencies
- chore(beads): record standard dialect follow-up status
- chore(beads): close standard api cleanup task
- chore(beads): record querybuilder audit progress
- chore(beads): record continued querybuilder audit
- chore(beads): record update assignment audit
- chore(beads): record source casing audit
- chore(beads): record nested renderer audit
- chore(beads): close runtime validation issue
- chore(beads): record having audit slice
- chore(beads): record grouped order audit slice
- chore(beads): record distinct on audit slice
- chore(beads): record standard index audit slice
- chore(beads): record standard table audit slice
- chore(beads): record standard regex audit slice
- chore(beads): record standard returning audit slice
- chore(beads): record standard conflict audit slice
- chore(beads): record excluded scope audit slice
- chore(beads): record joined mutation audit slice
- chore(beads): record row locking audit slice
- chore(beads): record truncate audit slice
- chore(beads): record full join audit slice
- chore(beads): record lateral audit slice
- chore(beads): record quantified comparison audit slice
- chore(beads): record set all audit slice
- chore(beads): preserve audit notes

### Performance

- perf(querybuilder): remove type-covered runtime validation
- perf(runtime): remove redundant conflict and lock guards
- perf(runtime): remove redundant ddl target guards
- perf(runtime): remove redundant conflict column checks
- perf(runtime): remove redundant query shape guards
- perf(runtime): remove redundant plan composition guards
- perf(runtime): remove redundant mutation guards
- perf(runtime): remove redundant generated dsl checks
- perf(runtime): remove redundant distinctOn arity guard
- perf(querybuilder): remove type-covered runtime validation
- perf(querybuilder): remove type-covered renderer validation
- perf(querybuilder): remove type-covered alias validation
- perf(querybuilder): remove type-covered casing validation
- perf(querybuilder): defer statement identifier validation to renderer
- perf(querybuilder): remove type-covered conflict constraint guard
- perf(querybuilder): remove type-covered statement identifier guard
- perf(querybuilder): trust typed db type names in renderers
- perf(querybuilder): remove type-covered cast target validation
- perf(querybuilder): remove type-covered from statement guard
- perf(querybuilder): remove type-covered ddl clause guards
- perf(querybuilder): remove type-covered transaction kind guard
- perf(querybuilder): remove type-covered query statement guard
- perf(querybuilder): remove type-covered merge action guards
- perf(querybuilder): remove mixed variadic pipe runtime guard
- perf(querybuilder): remove cast grouping-key runtime guard
- perf(querybuilder): remove aliased table option runtime guard
- perf(querybuilder): remove class option primary-key runtime guard
- perf(querybuilder): remove json key grouping runtime guard
- perf(querybuilder): remove json path grouping runtime guards
- perf(querybuilder): remove grouping fallback runtime guard
- perf(querybuilder): defer grouped invalid-date validation to render boundaries
- perf(querybuilder): normalize grouping collation keys
- perf(querybuilder): remove foreign-key reference-column runtime guard
- perf(querybuilder): remove foreign-key local-column runtime guard
- perf(querybuilder): remove empty index option runtime guard
- perf(querybuilder): remove foreign-key known-columns runtime guard
- perf(querybuilder): remove foreign-key arity runtime guard
- perf(querybuilder): remove foreign-key resolver runtime guard
- perf(querybuilder): defer foreign-key action validation to renderers
- perf(querybuilder): remove index key-array runtime guard
- perf(querybuilder): skip malformed index key metadata entries
- perf(querybuilder): remove table option-name runtime guard
- perf(querybuilder): remove table option boolean-flag guards
- perf(querybuilder): remove index identifier runtime guards
- perf(querybuilder): remove foreign-key identifier runtime guards
- perf(querybuilder): remove nullable-primary-key runtime guard
- perf(querybuilder): remove non-index column-count runtime guard
- perf(querybuilder): remove unknown-column runtime guards
- perf(querybuilder): remove index key runtime validation guards
- perf(querybuilder): remove check option runtime validation guards
- perf(querybuilder): remove index include runtime array guard

### Other

- bd init: initialize beads issue tracking

## 0.17.0 - 2026-05-12

### Features

- feat(querybuilder): add sqlite dialect

### Fixes

- fix(querybuilder): enforce render and decode completeness
- fix(querybuilder): reject unsupported mysql sql
- fix(querybuilder): render ddl identifiers safely
- fix(querybuilder): validate nested query rendering
- fix(querybuilder): reject unsupported postgres modifiers
- fix(querybuilder): reject unsupported runtime clauses
- fix(querybuilder): preserve renderer row types
- fix(querybuilder): reject missing nested aliases
- fix(postgres): quote schema enum column types
- fix(database): preserve quoted ddl enum filters
- fix(database): canonicalize quoted qualified types
- fix(postgres): align enum type name literals
- fix(postgres): quote sequence nextval names
- fix(database): parse quoted sequence defaults
- fix(database): infer quoted qualified type kinds
- fix(database): pull quoted enum arrays
- fix(database): preserve dotted sequence pull keys
- fix(database): preserve dotted discovered identities
- fix(database): parse quoted index support identifiers
- fix(database): parse quoted migration table names
- fix(database): preserve dotted introspected table keys
- fix(querybuilder): escape json predicate path keys
- fix(querybuilder): compare set projection paths structurally
- fix(querybuilder): preserve dotted predicate source names
- fix(querybuilder): escape predicate keys in type facts
- fix(database): reject malformed migration table identifiers
- fix(querybuilder): escape dotted grouping keys
- fix(querybuilder): support json expression grouping keys
- fix(querybuilder): escape json grouping identity segments
- fix(querybuilder): support binary predicate grouping keys
- fix(querybuilder): support collate grouping identity
- fix(querybuilder): support function grouping keys
- fix(querybuilder): support subquery grouping keys
- fix(querybuilder): validate derived projection aliases
- fix(querybuilder): reject invalid derived aliases in types
- fix(querybuilder): validate cte lateral aliases in types
- fix(querybuilder): restrict excluded to columns
- fix(querybuilder): infer values rows across tuple
- fix(querybuilder): type-check unnest column lengths
- fix(querybuilder): type-reject mysql merge
- fix(querybuilder): reject empty table option columns
- fix(querybuilder): type-check foreign key arity
- fix(querybuilder): require rich index target
- fix(querybuilder): validate rich index columns in types
- fix(querybuilder): preserve rich constraint columns in types
- fix(querybuilder): type-check foreign key columns
- fix(querybuilder): type-check schema table options
- fix(querybuilder): specialize postgres schema tables
- fix(querybuilder): type-check class option columns
- fix(querybuilder): reject cross-dialect from sources
- fix(querybuilder): reject cross-dialect join sources
- fix(querybuilder): reject cross-dialect structured source expressions
- fix(querybuilder): reject cross-dialect table function expressions
- fix(querybuilder): track distinct on expression sources
- fix(querybuilder): reject mixed dialect plans
- fix(querybuilder): track conflict target predicates
- fix(querybuilder): require merge action clauses
- fix(querybuilder): reject mixed mutation tuple targets
- fix(querybuilder): specialize public mutation input dialects
- fix(querybuilder): reject tuple update value dialects
- fix(querybuilder): reject upsert value dialects
- fix(querybuilder): reject mutation value dialects
- fix(querybuilder): track insert source dialects
- fix(executor): decode custom projection aliases by path
- fix(renderer): validate custom projection paths
- fix(querybuilder): allow reordered values row keys
- fix(querybuilder): reject empty values rows
- fix(querybuilder): validate unnest column arrays
- fix(querybuilder): reject incomplete derived sources
- fix(querybuilder): enforce lateral source requirements
- fix(querybuilder): reject incomplete set operands
- fix(querybuilder): keep insert select source requirements
- fix(querybuilder): reject mutation subquery expressions
- fix(querybuilder): avoid duplicate nested ctes
- fix(mysql): reject data modifying ctes
- fix(querybuilder): reject mutation inline sources
- fix(querybuilder): preserve cross join facts
- fix(querybuilder): preserve structured from facts
- fix(querybuilder): preserve set result facts
- fix(querybuilder): preserve only common set facts
- fix(json): respect createMissing false types
- fix(mysql): honor json set createMissing false
- fix(mysql): render json array inserts correctly
- fix(mysql): render negative json indexes
- fix(mysql): render negative json slices
- fix(mysql): render recursive json descent
- fix(json): reject non-exact mutation paths
- fix(mysql): type scalar json length
- fix(json): type array keys as null
- fix(mysql): type json type names
- fix(mysql): reject unsupported json helpers
- fix(postgres): render json keys as json
- fix(postgres): type json scalar text
- fix(postgres): preserve curried json helper types
- fix(json): type negative tuple indexes
- fix(json): preserve mutation value literals
- fix(executor): decode json string scalars
- fix(executor): preserve schema-valid json strings
- fix(json): distribute nullable helper result types
- fix(executor): allow schema-valid json nulls
- fix(executor): reject non-finite json numbers
- fix(executor): validate normalized json values
- fix(postgres): preserve json string mutation values
- fix(executor): reject normalized non-finite numbers
- fix(executor): validate derived finite numbers
- fix(executor): canonicalize decimal negative zero
- fix(executor): reject impossible local dates
- fix(executor): validate normalized local dates
- fix(executor): validate temporal runtime strings
- fix(executor): validate canonical numeric strings
- fix(executor): pad early Date years
- fix(mutation): normalize raw column values
- fix(mutation): normalize unnest array values
- fix(mutation): normalize literal expression values
- fix(mutation): validate normalized column values
- fix(mysql): prioritize returning cte errors
- fix(executor): reject loose local date strings
- fix(executor): reject non-decimal numeric strings
- fix(json): escape control characters in path keys
- fix(mysql): tighten error catalog type guards
- fix(errors): parse numeric fields as decimal strings
- fix(executor): reject non-plain json objects
- fix(rendering): reject invalid date literal params
- fix(runtime): reject non-finite json primitives
- fix(sqlite): store json strings as json text
- fix(querybuilder): harden statement edge cases
- fix(querybuilder): reject invalid statement edge cases
- fix(querybuilder): reject unsupported unique ddl options
- fix(sqlite): preserve nested json values
- fix(mysql): preserve nested json values
- fix(sqlite): preserve json merge literals
- fix(mysql): render json path exists segments
- fix(sqlite): render json path exists segments
- fix(mysql): encode structured json inserts
- fix(querybuilder): validate unnest insert values
- fix(querybuilder): reject unknown conflict targets
- fix(mysql): reject scoped conflict targets
- fix(sqlite): type scoped conflict predicates
- fix(mysql): reject object conflict targets
- fix(sqlite): reject ignored mutation modifiers
- fix(postgres): reject delete lock modifiers
- fix(sqlite): avoid invalid rendered sql
- fix(sqlite): render derived value sources without column aliases
- fix(querybuilder): inline ddl expression literals
- fix(sqlite): render set operations as compound selects
- fix(sqlite): reject unsupported set all variants
- fix(sqlite): reject unsupported json wildcard paths
- fix(sqlite): render temporal helpers with sqlite functions
- fix(sqlite): reject unsupported json array inserts
- fix(postgres): bind json array indexes as numbers
- fix(sqlite): reject empty update assignments
- fix(querybuilder): reject unsupported dialect syntax
- fix(querybuilder): accept single ddl index columns
- fix(sqlite): reject all transaction options
- fix(querybuilder): narrow unique options by dialect
- fix(sqlite): type-reject lateral sources
- fix(sqlite): type-reject truncate statements
- fix(sqlite): type-reject row locks
- fix(sqlite): type-reject unsupported set all operators
- fix(sqlite): type-reject unsupported read predicates
- fix(sqlite): type-reject container operators
- fix(querybuilder): type-reject conflicting lock options
- fix(sqlite): type-reject unsupported json path segments
- fix(sqlite): type-reject json array inserts
- fix(querybuilder): require conflict updates for action predicates
- fix(querybuilder): type-reject empty update assignments
- fix(postgres): type-reject empty merge actions
- fix(sqlite): type-reject joined deletes
- fix(mysql): type-reject empty selections
- fix(sqlite): reject empty selections
- fix(querybuilder): reject empty conflict updates
- fix(querybuilder): reject empty upsert updates
- fix(querybuilder): validate upsert conflict columns
- fix(querybuilder): accept string conflict columns
- fix(querybuilder): reject empty returning selections
- fix(querybuilder): reject scalar selections
- fix(querybuilder): validate selection leaves
- fix(postgres): reject empty distinct on
- fix(querybuilder): reject empty group by
- fix(querybuilder): reject invalid order directions
- fix(querybuilder): reject invalid lock modes
- fix(querybuilder): reject invalid window order directions
- fix(postgres): normalize rich index columns
- fix(database): reject invalid index key modifiers
- fix(database): validate index methods
- fix(querybuilder): reject invalid foreign key actions
- fix(querybuilder): validate rendered isolation levels
- fix(querybuilder): validate rendered lock modes
- fix(querybuilder): reject invalid transaction kinds
- fix(querybuilder): reject invalid statement kinds
- fix(querybuilder): reject unknown table options
- fix(querybuilder): reject mismatched ddl payloads
- fix(querybuilder): reject mismatched truncate payloads
- fix(postgres): reject invalid merge discriminants
- fix(querybuilder): reject invalid insert sources
- fix(querybuilder): reject invalid conflict discriminants
- fix(querybuilder): harden query and mutation runtime guards
- fix(querybuilder): validate ddl table targets
- fix(querybuilder): type dialect driver factories

### Tests

- test(querybuilder): cover postgres cte scoping
- test(database): cover postgres schema diff edge cases
- test(querybuilder): cover missing projection decode
- test(querybuilder): reproduce mysql legality type gaps
- test(querybuilder): reproduce renderer row type gap
- test(querybuilder): reproduce mysql runtime legality gaps
- test(querybuilder): reproduce mysql nested json delete path bug
- test(querybuilder): reproduce mysql json path parameter order bug
- test(querybuilder): reproduce ddl check qualification bug
- test(querybuilder): reproduce postgres drop index schema bug
- test(querybuilder): reproduce incomplete plan render bug
- test(querybuilder): reproduce set operand runtime validation bug
- test(querybuilder): reproduce ignored statement filter bug
- test(querybuilder): reproduce ignored merge returning bug
- test(querybuilder): reproduce ignored distinct modifier bug
- test(querybuilder): reproduce ignored offset modifier bug
- test(querybuilder): reproduce ignored limit modifier bug
- test(querybuilder): reproduce ignored order modifier bug
- test(querybuilder): reproduce ignored lock modifier bug
- test(querybuilder): reproduce ignored ddl returning bug
- test(querybuilder): cover transaction source rejection
- test(querybuilder): reproduce ignored having predicate bug
- test(querybuilder): reproduce ignored group modifier bug
- test(querybuilder): reproduce ignored join modifier bug
- test(querybuilder): reproduce ignored transaction filter bug
- test(querybuilder): reproduce ignored ddl index returning bug
- test(querybuilder): reproduce ignored ddl drop filter bug
- test(querybuilder): reproduce ignored ddl index filter bug
- test(querybuilder): reproduce nested projection decode gap
- test(querybuilder): reproduce streamed nested decode gap
- test(querybuilder): cover byte and array decoding
- test(querybuilder): align implication row fixtures
- test(querybuilder): cover executor value mapping params
- test(database): cover migration file parsing
- test(database): reproduce quoted enum column ddl
- test(database): typecheck migration parser coverage
- test(database): reproduce quoted enum filter gap
- test(database): reproduce quoted qualified type canonicalization
- test(postgres): reproduce quoted enum type name types
- test(postgres): reproduce quoted sequence nextval
- test(database): reproduce quoted sequence pull gap
- test(database): reproduce quoted type kind inference
- test(database): reproduce quoted enum array pull gap
- test(database): reproduce dotted sequence pull gap
- test(database): reproduce discovered dotted enum identity collapse
- test(database): reproduce quoted index support identifier rendering
- test(database): reproduce quoted migration table parsing
- test(database): reproduce introspected dotted table identity collapse
- test(querybuilder): reproduce dotted json path predicate key collapse
- test(querybuilder): cover dotted predicate column keys
- test(querybuilder): reproduce set projection dotted path collision
- test(querybuilder): cover dotted set operand type shape
- test(querybuilder): reproduce dotted source dependency collision
- test(querybuilder): cover dotted source dependencies
- test(querybuilder): reproduce dotted table source promotion
- test(querybuilder): reproduce dotted source promotion types
- test(database): reproduce malformed migration table config
- test(package): cover dotted source types in pack smoke
- test(querybuilder): reproduce dotted grouping key collision
- test(querybuilder): reproduce json grouping key support
- test(querybuilder): reproduce json grouping path collisions
- test(querybuilder): reproduce regex grouping key support
- test(querybuilder): reproduce collate grouping key support
- test(querybuilder): reproduce collate grouping type identity
- test(querybuilder): reproduce function grouping key support
- test(querybuilder): reproduce exists grouping key support
- test(querybuilder): cover quantified subquery grouping
- test(querybuilder): reproduce derived alias collision
- test(querybuilder): reproduce derived alias type gaps
- test(querybuilder): cover curried derived alias types
- test(querybuilder): reproduce cte lateral alias type gaps
- test(querybuilder): reproduce excluded expression type gap
- test(querybuilder): reproduce values row type gaps
- test(querybuilder): reproduce unnest length type gap
- test(querybuilder): reproduce mysql merge type gap
- test(querybuilder): reproduce empty table option type gaps
- test(querybuilder): reproduce foreign key arity type gap
- test(querybuilder): reproduce rich index shape gap
- test(querybuilder): reproduce rich index column type gaps
- test(querybuilder): reproduce rich constraint column type gaps
- test(querybuilder): reproduce foreign key column type gaps
- test(querybuilder): cover mysql foreign key column types
- test(querybuilder): reproduce schema table option type gaps
- test(querybuilder): reproduce postgres schema dialect leak
- test(querybuilder): reproduce class option column type gaps
- test(querybuilder): reproduce cross-dialect source type gaps
- test(querybuilder): reproduce cross-dialect join type gaps
- test(querybuilder): cover cross-dialect mutation targets
- test(querybuilder): cover cross-dialect ddl targets
- test(querybuilder): cover cross-dialect expressions
- test(querybuilder): cover cross-dialect merge inputs
- test(querybuilder): reproduce cross-dialect structured source expressions
- test(querybuilder): reproduce cross-dialect table function expressions
- test(querybuilder): reproduce distinct on source gap
- test(querybuilder): reproduce mixed dialect render gap
- test(querybuilder): reproduce conflict target predicate source gap
- test(querybuilder): cover cross-dialect merge predicates
- test(querybuilder): cover complete merge plans
- test(querybuilder): reproduce empty merge action gap
- test(querybuilder): cover cross-dialect merge clauses
- test(querybuilder): reproduce mixed mutation tuple targets
- test(querybuilder): reproduce widened mutation value dialect gap
- test(querybuilder): cover widened predicate dialects
- test(querybuilder): reproduce tuple update value dialect gap
- test(querybuilder): reproduce upsert value dialect gaps
- test(querybuilder): reproduce mutation value dialect gaps
- test(querybuilder): reproduce insert source dialect gap
- test(querybuilder): cover invalid returning selections
- test(querybuilder): cover mutation clause dialects
- test(querybuilder): cover cross-dialect set operands
- test(querybuilder): cover wrapped source dialects
- test(querybuilder): cover lateral source dialects
- test(executor): reproduce custom projection alias decode
- test(renderer): reproduce invalid custom projection path
- test(querybuilder): reproduce values row order mismatch
- test(querybuilder): reproduce empty values rows
- test(querybuilder): reproduce invalid unnest values
- test(mysql): cover unsupported generateSeries rendering
- test(querybuilder): cover numeric clause dialects
- test(querybuilder): reproduce incomplete derived sources
- test(querybuilder): reproduce premature lateral joins
- test(querybuilder): reproduce incomplete set operands
- test(querybuilder): reproduce incomplete insert select source
- test(querybuilder): reproduce mutation subquery expression
- test(querybuilder): cover cte source rendering
- test(querybuilder): reproduce duplicate nested ctes
- test(mysql): reproduce data modifying cte
- test(querybuilder): reproduce mutation inline sources
- test(querybuilder): cover curried mutation derived source
- test(querybuilder): reproduce cross join lost facts
- test(querybuilder): reproduce structured from lost facts
- test(querybuilder): reproduce set result lost facts
- test(querybuilder): reproduce unsound set narrowing
- test(package): cover packed query type facts
- test(json): reproduce createMissing false set type
- test(mysql): reproduce json set createMissing false
- test(mysql): reproduce json array insert rendering
- test(mysql): reproduce negative json index rendering
- test(mysql): reproduce negative json slice rendering
- test(mysql): reproduce recursive json path rendering
- test(json): reproduce wildcard mutation path types
- test(mysql): reproduce scalar json length type
- test(json): reproduce array json keys type
- test(mysql): reproduce json type name casing
- test(mysql): reproduce unsupported json helper types
- test(postgres): reproduce json keys array rendering
- test(postgres): reproduce json scalar text types
- test(postgres): reproduce curried json helper types
- test(json): reproduce negative tuple index type
- test(json): reproduce mutation value widening
- test(pack): cover exported json path types
- test(types): cover null-leading coalesce strings
- test(executor): cover record cast decoding
- test(executor): reproduce json string scalar decode
- test(executor): reproduce numeric-looking json string decode
- test(json): reproduce nullable helper union types
- test(executor): cover instant normalization
- test(executor): reproduce json null schema decode
- test(executor): reproduce non-finite json numbers
- test(executor): reproduce normalized json number validation
- test(postgres): reproduce json string mutation encoding
- test(mysql): cover json string insert encoding
- test(postgres): cover json helper string encoding
- test(mysql): cover json helper string encoding
- test(executor): reproduce normalized non-finite numbers
- test(executor): reproduce normalized aggregate infinity
- test(executor): cover normalized window finite numbers
- test(executor): reproduce decimal negative zero
- test(executor): reproduce impossible local date
- test(executor): reproduce normalized impossible local date
- test(executor): reproduce impossible temporal values
- test(executor): reproduce noncanonical normalized numeric strings
- test(executor): reproduce noncanonical normalized bigint strings
- test(executor): reproduce unpadded early Date years
- test(postgres): reproduce unvalidated insert params
- test(postgres): reproduce unvalidated unnest insert params
- test(postgres): reproduce unvalidated literal insert params
- test(postgres): reproduce unvalidated normalized insert values
- test(postgres): cover mutation value canonicalization
- test(json): use valid mutation UUID fixtures
- test(executor): reproduce prefixed local date coercion
- test(executor): reproduce hex numeric string coercion
- test(json): reproduce control character path escaping
- test(mysql): reproduce loose error catalog guards
- test(errors): reproduce loose numeric field parsing
- test(executor): reproduce non-plain json object acceptance
- test(executor): cover normalized json object domain
- test(postgres): cover invalid date insert objects
- test(rendering): reproduce invalid date literal params
- test(sqlite): cover json merge structured operands
- test(sqlite): cover partial conflict target execution
- test(sqlite): cover returning mutations
- test(sqlite): cover right and full joins
- test(sqlite): cover composed executor workflows

### CI

- ci: fix package manager setup caches

## 0.16.0 - 2026-05-12

### Features

- feat(querybuilder): narrow jsonb unions from discriminator predicates
- feat(querybuilder): carry predicate facts through query plans
- feat(querybuilder): expand predicate fact output narrowing
- feat(querybuilder): add driver value mappings

### Docs

- docs: document stream execution in readme

### Tests

- test(querybuilder): cover driver value mapping types

### Chores

- chore: use tsgo beta channel

## 0.15.0 - 2026-04-14

### Features

- feat(querybuilder): add stream execution APIs

### Fixes

- fix(column): preserve bound-column brands in result rows
- fix(query): allow any comparisons and drop unsafeAny in tests
- fix: align typecheck docs and tests with tsgo
- fix(querybuilder): enforce string length limits in schemas
- fix(database): stabilize postgres pull and migrations

### Refactors

- refactor(query): reduce type instantiation depth
- refactor: rename Expression and Plan to Scalar and RowSet
- refactor(postgres): move private implementation under postgres/internal
- refactor(mysql): move private implementation under mysql/internal
- refactor(querybuilder): split dialect internals and simplify typing
- refactor: overhaul query builder internals

### Docs

- docs(readme): refresh query examples
- docs(readme): refocus error handling examples
- docs(readme): use a real read-plan error example

### Tests

- test(readme): typecheck documented examples
- test(errors): cover tagged postgres executor handlers
- test: isolate bun coverage config for scripted runs

### Build

- build(packages): declare node 22 support
- build(packages): point declaration facades at js outputs

### CI

- ci(workflows): dispatch publish from release
- ci(publish): set npm token env for bun publish
- ci: add node 22 smoke lane

### Chores

- chore(scripts): remove mysql error catalog generator
- chore(gitignore): ignore ts trace output

### Other

- fix dependency tracking and not-in implication facts
- tighten predicate operator input inference
- fix metadata and json typing regressions
- document current query shape typing limits
- update behavior tests for rowset and scalar names

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

