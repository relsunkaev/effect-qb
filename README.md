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

`effectdb` exposes:

```sh
effectdb push
effectdb pull
effectdb migrate generate
effectdb migrate up
```

Config files use `effectdb.config.ts` and `defineConfig` from `effect-db`.
