import { defineConfig } from "effect-db"

export default defineConfig({
  dialect: "postgres",
  db: {
    url: "postgres://postgres:XeOIfV62tRb6bpERAPmkCIjs9j91JQop@uplinq-live-databasecluster-ensboeew.cluster-c04uvdndao3z.us-east-1.rds.amazonaws.com:5432/uplinq"
  },
  source: {
    include: ["src/**/*.ts"]
  },
  migrations: {
    dir: "migrations",
    table: "public.effect_qb_migrations"
  },
  safety: {
    nonDestructiveDefault: true
  }
})
