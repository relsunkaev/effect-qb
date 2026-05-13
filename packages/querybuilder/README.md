# effect-qb

`effect-qb` is the typed SQL querybuilder package in this workspace.

## Install

```sh
bun add effect-qb
```

For the parallel Effect v4 beta lane:

```sh
bun add effect-qb@beta effect@4.0.0-beta.66
```

## Entry points

- `effect-qb/postgres`
- `effect-qb/mysql`
- `effect-qb/sqlite`
- `effect-qb/postgres/metadata`

`effect-qb/postgres/metadata` exposes normalized table and enum metadata helpers used by `effectdb`.
