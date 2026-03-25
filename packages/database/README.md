# effect-db

`effect-db` is the Postgres schema tooling package in this workspace.

## Install

```sh
bun add effect-db
```

## Config

Use `effect-db.config.ts` and import `defineConfig` from `effect-db`:

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
effect-db push
effect-db pull
effect-db migrate generate
effect-db migrate up
```
