import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"

import { describe, expect, test } from "bun:test"

import { loadPostgresConfig, resolveDatabaseUrl } from "../../../src/internal/postgres-config.js"

const repoRoot = process.cwd()

describe("postgres config", () => {
  test("rejects invalid dialects", async () => {
    const tempDir = await mkdtemp(join(repoRoot, "test/.tmp-postgres-config-"))
    try {
      await Bun.write(join(tempDir, "effect-qb.config.ts"), `
export default {
  dialect: "mysql",
  db: {
    url: "postgres://example"
  },
  source: {
    include: ["schema.ts"]
  },
  migrations: {
    dir: "migrations",
    table: "effect_qb_migrations"
  },
  safety: {
    nonDestructiveDefault: true
  }
}
`)

      await expect(loadPostgresConfig(tempDir)).rejects.toThrow("Unsupported dialect 'mysql'")
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  test("rejects empty include globs", async () => {
    const tempDir = await mkdtemp(join(repoRoot, "test/.tmp-postgres-config-"))
    try {
      await Bun.write(join(tempDir, "effect-qb.config.ts"), `
export default {
  dialect: "postgres",
  db: {
    url: "postgres://example"
  },
  source: {
    include: []
  },
  migrations: {
    dir: "migrations",
    table: "effect_qb_migrations"
  },
  safety: {
    nonDestructiveDefault: true
  }
}
`)

      await expect(loadPostgresConfig(tempDir)).rejects.toThrow("Schema source discovery requires at least one include glob")
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  test("rejects missing explicit config paths", async () => {
    const tempDir = await mkdtemp(join(repoRoot, "test/.tmp-postgres-config-"))
    try {
      await expect(loadPostgresConfig(tempDir, "missing.config.ts")).rejects.toThrow()
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  test("resolves override and env database urls", () => {
    process.env.EFFECT_QB_TEST_URL = "postgres://env-url"
    try {
      expect(resolveDatabaseUrl({
        dialect: "postgres",
        db: {
          url: "postgres://config-url",
          urlEnv: "EFFECT_QB_TEST_URL"
        },
        source: {
          include: ["schema.ts"]
        },
        migrations: {
          dir: "migrations",
          table: "effect_qb_migrations"
        },
        safety: {
          nonDestructiveDefault: true
        }
      }, "postgres://override-url")).toBe("postgres://override-url")

      expect(resolveDatabaseUrl({
        dialect: "postgres",
        db: {
          urlEnv: "EFFECT_QB_TEST_URL"
        },
        source: {
          include: ["schema.ts"]
        },
        migrations: {
          dir: "migrations",
          table: "effect_qb_migrations"
        },
        safety: {
          nonDestructiveDefault: true
        }
      })).toBe("postgres://env-url")
    } finally {
      delete process.env.EFFECT_QB_TEST_URL
    }
  })

  test("rejects missing database urls", () => {
    expect(() => resolveDatabaseUrl({
      dialect: "postgres",
      db: {},
      source: {
        include: ["schema.ts"]
      },
      migrations: {
        dir: "migrations",
        table: "effect_qb_migrations"
      },
      safety: {
        nonDestructiveDefault: true
      }
    })).toThrow("Database URL is required")
  })
})
