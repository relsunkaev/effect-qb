# effect-qb workspace

This repo is now a Bun workspace with two published packages:

- `effect-qb`: typed SQL querybuilder and dialect facades
- `effect-db`: Postgres schema tooling, introspection, migrations, and CLI

## Install

```sh
bun add effect-qb
bun add effect-db
```

## Packages

- [packages/querybuilder/README.md](/Users/ramazan/Code/oss/effect-qb/packages/querybuilder/README.md)
- [packages/database/README.md](/Users/ramazan/Code/oss/effect-qb/packages/database/README.md)

## CLI

`effect-db` exposes:

```sh
effect-db push
effect-db pull
effect-db migrate generate
effect-db migrate up
```

Config files use `effect-db.config.ts` and `defineConfig` from `effect-db`.
