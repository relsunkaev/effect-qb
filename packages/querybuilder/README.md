# effect-qb

`effect-qb` is the typed SQL querybuilder package in this workspace.

## Install

```sh
bun add effect-qb
```

## Entry points

- `effect-qb`
- `effect-qb/postgres`
- `effect-qb/standard`
- `effect-qb/mysql`
- `effect-qb/sqlite`
- `effect-qb/postgres/metadata`

`effect-qb/postgres/metadata` exposes normalized table and enum metadata helpers used by `effectdb`.

Use the `Sql` namespace from `effect-qb` for portable query plans that should render through the built-in SQL renderers. `effect-qb/standard` remains available as an explicit portable subpath.
