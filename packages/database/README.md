# effect-db

`effect-db` is the Postgres schema tooling package in this workspace. It ships the `effectdb` binary.

## Install

```sh
bun add effect-db effect
```

The `effect-db@4.0.0-beta.66` beta artifact was deprecated because it shipped a broken generated type declaration. Wait for the next `effect-db` beta before installing the schema-management CLI from npm's beta channel.

## Config

Use `effectdb.config.ts` and import `defineConfig` from `effect-db`:

```ts
import { defineConfig } from "effect-db"

export default defineConfig({
  dialect: "postgres",
  db: {
    url: process.env.DATABASE_URL
  },
  source: {
    include: ["src/**/*.ts"]
  },
  migrations: {
    dir: "migrations",
    table: "effect_qb_migrations"
  },
  safety: {
    nonDestructiveDefault: true
  }
})
```

## CLI

```sh
effectdb push
effectdb pull
effectdb migrate generate
effectdb migrate up
```

`effectdb` uses Effect CLI's global `--log-level` flag. Operational logs are
written to stderr and default to `info`; use `--log-level debug` for config
diagnostics or `--log-level none` to suppress logs. Plans and status
output remain on stdout.

## Runtime services

The CLI obtains file-system, path, crypto, and terminal capabilities from
`@effect/platform-node`. The core workflows also export `*Effect` variants that
accept the corresponding Effect Platform services, so another runtime can
provide its own implementations. Existing Promise APIs remain Node-backed for
compatibility.

## Operational Notes

`effectdb` manages canonical table and enum declarations, not the entire Postgres catalog.

### Rollback

- Use `effectdb migrate down --steps N` for recent migration files that were already applied.
- If the change was generated with `push`, prefer restoring from backup before replaying migrations.
- `down` only replays the migration history that `effectdb` knows about; it does not reconstruct data that was removed from the database.

### Destructive Changes

- Review `effectdb push --dry-run` output before applying schema changes.
- Use `--allow-destructive` only when you have a backup or a separate recovery path.
- Treat column drops, type changes, and table rewrites as manual operations when the resulting data loss matters.

### Recovery

- If migration bookkeeping gets out of sync, use `effectdb migrate repair`.
- If the database schema drifted outside of migrations, reconcile the drift first, then regenerate or repair migration state.
- After a bad deployment, restore the database, then bring the migration history back in sync before resuming normal deploys.

### Unsupported Postgres Features

- `effectdb` does not own views, triggers, stored procedures, functions, policies, grants, extensions, or other database-local objects.
- Keep those objects in separate migrations or manage them outside the `effectdb` pull/push loop.
- If you rely on server-side behavior that is not represented as table or enum declarations, do not expect `pull` to round-trip it.
