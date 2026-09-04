# effect-qb

`effect-qb` is the typed SQL querybuilder package in this workspace.

## Install

```sh
bun add effect-qb effect
```

For the parallel Effect v4 beta lane:

```sh
bun add effect-qb@beta effect@4.0.0-beta.98
```

## Entry points

- `effect-qb`
- `effect-qb/postgres`
- `effect-qb/mysql`
- `effect-qb/sqlite`
- `effect-qb/postgres/metadata`

`effect-qb/postgres/metadata` exposes normalized table and enum metadata helpers used by `effectdb`.

Use the root modules from `effect-qb` for portable query plans that should render through the built-in SQL renderers.

## Row decode diagnostics

Use `Executor.formatRowDecodeError(error)` when logging a `RowDecodeError`.
It reports dialect, failure stage, and projection path, omitting values, SQL,
causes, and custom schema messages. Projection identifiers are not redacted.
This formatter is available from the root and all dialect Executor modules.

For local debugging, `Executor.make({ reportInput: true })` on a dialect
executor enables Effect Schema's rejected-input reporting. To display raw rows,
query parameters, and detailed schema errors, explicitly call
`Executor.formatRowDecodeError(error, { reportInput: true })`.
Do not send this verbose output to shared logs.

The original error still retains `raw`, `normalized`, `query`, and `cause` for
compatibility. Logging the error object directly is **not** safe, even when
schema input reporting is disabled.
