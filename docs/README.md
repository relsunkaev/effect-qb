# Documentation

Start with the [main guide](../README.md) for installation, table definitions,
query construction, execution, and recipes. The documents below cover narrower
topics; they are not required reading before your first query.

## Using effect-qb

- [SQLite on Node.js](sqlite-node.md): client setup, runtime requirements, and
  streaming limits.
- [JSON transport](json-transport.md): stored values, driver representations,
  and custom value mappings.
- [Opt-in schema compilation](schema-compilation.md): when to try the unstable
  compiler and how to measure it on your own schemas.

## Support and design contracts

These explain the supported boundaries. Use the main guide's examples for the
current public API.

- [Portable authoring](standard-dialect-spec.md).
- [Dialect coercion](dialect-coercion-contract.md).
- [Numeric division and casts](numeric-division-contract.md).

## Maintaining the repository

- Implementation owners: [query DSL](dsl-ownership.md),
  [renderers](renderer-ownership.md), and [datatypes](datatype-ownership.md).
- [Release workflow](releases.md): preparation versus publication.
- [TypeScript compiler API evaluation](typescript-compiler-api.md): why runtime
  source discovery and workspace typechecking use different tools.
- [Contributing and local checks](../CONTRIBUTING.md).

## Historical migration and evaluation notes

These retain the decisions and version-specific evidence from earlier work.
Their snippets and dependency versions are not the current installation guide.

- [Migration to 0.23](migration-0.23.md).
- Effect v4: [opportunities](effect-v4-opportunities.md),
  [schema model](effect-v4-schema-model.md), and [schema optics](effect-v4-schema-optics.md).
- [Older standard-namespace proposal](standard-namespace.md) and its
  [query example](examples/standard-query.ts).
