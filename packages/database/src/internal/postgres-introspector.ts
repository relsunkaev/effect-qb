import * as Effect from "effect/Effect"
import * as SqlClient from "@effect/sql/SqlClient"

import { SchemaExpression } from "effect-qb/postgres"
import type { ColumnModel, EnumModel, SchemaModel, TableModel, ReferentialAction, TableOptionSpec } from "effect-qb/postgres/metadata"
import type { FilterConfig } from "./postgres-config.js"

type TableRow = {
  readonly schema_name: string
  readonly table_name: string
  readonly table_oid: number
}

type ColumnRow = {
  readonly schema_name: string
  readonly table_name: string
  readonly table_oid: number
  readonly attnum: number
  readonly column_name: string
  readonly ddl_type: string
  readonly db_type_kind: string
  readonly type_schema: string
  readonly type_kind: string
  readonly nullable: boolean
  readonly has_default: boolean
  readonly default_sql: string | null
  readonly generated_sql: string | null
  readonly identity_generation: "" | "a" | "d"
  readonly attcollation_oid: number
}

type ConstraintRow = {
  readonly schema_name: string
  readonly table_name: string
  readonly constraint_name: string
  readonly constraint_type: "p" | "u" | "f" | "c"
  readonly local_attnums: readonly number[] | null
  readonly referenced_attnums: readonly number[] | null
  readonly referenced_schema_name: string | null
  readonly referenced_table_name: string | null
  readonly deferrable: boolean
  readonly initially_deferred: boolean
  readonly check_sql: string | null
  readonly no_inherit: boolean
  readonly nulls_not_distinct: boolean
  readonly on_update: string
  readonly on_delete: string
}

type IndexRow = {
  readonly schema_name: string
  readonly table_name: string
  readonly index_name: string
  readonly index_oid: number
  readonly unique: boolean
  readonly method: string
  readonly predicate_sql: string | null
  readonly indnkeyatts: number
  readonly indnatts: number
  readonly indkey: string
  readonly indclass: string
  readonly indcollation: string
  readonly indoption: string
}

type IndexKeyRow = {
  readonly index_oid: number
  readonly position: number
  readonly key_sql: string
}

type OpclassRow = {
  readonly oid: number
  readonly opcdefault: boolean
}

type EnumRow = {
  readonly schema_name: string
  readonly type_name: string
  readonly enum_label: string
  readonly sort_order: number
}

const normalizeFilter = (filter?: FilterConfig): {
  readonly schemas: readonly string[] | null
  readonly tables: readonly string[] | null
} => ({
  schemas: filter?.schemas?.length ? [...filter.schemas] : null,
  tables: filter?.tables?.length ? [...filter.tables] : null
})

const parseVector = (value: string): readonly number[] =>
  value.trim() === ""
    ? []
    : value.trim().split(" ").map((item) => Number(item))

const parseAction = (value: string): ReferentialAction => {
  switch (value) {
    case "a":
      return "noAction"
    case "r":
      return "restrict"
    case "c":
      return "cascade"
    case "n":
      return "setNull"
    case "d":
      return "setDefault"
    default:
      throw new Error(`Unsupported foreign-key action code '${value}'`)
  }
}

const stripOrderingSuffix = (value: string): {
  readonly expressionSql: string
  readonly order?: "asc" | "desc"
  readonly nulls?: "first" | "last"
} => {
  let remaining = value.trim()
  let nulls: "first" | "last" | undefined
  let order: "asc" | "desc" | undefined
  if (remaining.toUpperCase().endsWith(" NULLS FIRST")) {
    nulls = "first"
    remaining = remaining.slice(0, -12).trimEnd()
  } else if (remaining.toUpperCase().endsWith(" NULLS LAST")) {
    nulls = "last"
    remaining = remaining.slice(0, -11).trimEnd()
  }
  if (remaining.toUpperCase().endsWith(" DESC")) {
    order = "desc"
    remaining = remaining.slice(0, -5).trimEnd()
  } else if (remaining.toUpperCase().endsWith(" ASC")) {
    order = "asc"
    remaining = remaining.slice(0, -4).trimEnd()
  }
  return {
    expressionSql: remaining,
    order,
    nulls
  }
}

const quoteIdentifier = (value: string): string =>
  `"${value.replaceAll("\"", "\"\"")}"`

const isSimpleIndexColumnReference = (
  sql: string,
  columnName: string
): boolean => {
  const trimmed = sql.trim()
  return trimmed === columnName || trimmed === quoteIdentifier(columnName)
}

const parseExpression = (sql: string, context: string) => {
  try {
    return SchemaExpression.normalize(SchemaExpression.parseExpression(sql))
  } catch (error) {
    throw new Error(`Unsupported PostgreSQL expression in ${context}: ${(error as Error).message}`)
  }
}

const makeColumnModel = (row: ColumnRow): ColumnModel => ({
  name: row.column_name,
  ddlType: row.ddl_type,
  dbTypeKind: row.ddl_type.trim().endsWith("[]")
    ? row.ddl_type.trim().replace(/\s+/g, " ").toLowerCase()
    : row.db_type_kind,
  typeKind: row.type_kind,
  typeSchema: row.type_schema,
  nullable: row.nullable,
  hasDefault: row.has_default || row.identity_generation === "d",
  generated: row.generated_sql !== null || row.identity_generation === "a",
  defaultSql: row.default_sql === null
    ? undefined
    : SchemaExpression.render(parseExpression(row.default_sql, `default for ${row.table_name}.${row.column_name}`)),
  generatedSql: row.generated_sql === null
    ? undefined
    : SchemaExpression.render(parseExpression(row.generated_sql, `generated expression for ${row.table_name}.${row.column_name}`)),
  identity: row.identity_generation === ""
    ? undefined
    : {
        generation: row.identity_generation === "a" ? "always" : "byDefault"
      },
  column: undefined
})

export const introspectPostgresSchema = (
  filter?: FilterConfig
): Effect.Effect<SchemaModel, unknown, SqlClient.SqlClient> =>
  Effect.flatMap(SqlClient.SqlClient, (sql) =>
    Effect.gen(function*() {
      const normalizedFilter = normalizeFilter(filter)
      const tables = yield* sql.unsafe<TableRow>(`
        select
          n.nspname as schema_name,
          c.relname as table_name,
          c.oid as table_oid
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where c.relkind = 'r'
          and n.nspname not in ('pg_catalog', 'information_schema')
          and ($1::text[] is null or n.nspname = any($1))
          and ($2::text[] is null or c.relname = any($2))
        order by n.nspname, c.relname
      `, [normalizedFilter.schemas, normalizedFilter.tables])

      const tableOids = tables.map((table) => table.table_oid)
      if (tableOids.length === 0) {
        return {
          dialect: "postgres",
          enums: [],
          tables: []
        } satisfies SchemaModel
      }

      const columns = yield* sql.unsafe<ColumnRow>(`
        select
          n.nspname as schema_name,
          c.relname as table_name,
          c.oid as table_oid,
          a.attnum as attnum,
          a.attname as column_name,
          format_type(a.atttypid, a.atttypmod) as ddl_type,
          t.typname as db_type_kind,
          tn.nspname as type_schema,
          t.typtype as type_kind,
          not a.attnotnull as nullable,
          ad.adbin is not null and a.attgenerated = '' as has_default,
          case when a.attgenerated = '' then pg_get_expr(ad.adbin, ad.adrelid, true) else null end as default_sql,
          case when a.attgenerated <> '' then pg_get_expr(ad.adbin, ad.adrelid, true) else null end as generated_sql,
          a.attidentity as identity_generation,
          a.attcollation as attcollation_oid
        from pg_attribute a
        join pg_class c on c.oid = a.attrelid
        join pg_namespace n on n.oid = c.relnamespace
        join pg_type t on t.oid = a.atttypid
        join pg_namespace tn on tn.oid = t.typnamespace
        left join pg_attrdef ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum
        where a.attnum > 0
          and not a.attisdropped
          and c.oid = any($1::oid[])
        order by n.nspname, c.relname, a.attnum
      `, [tableOids])

      const constraints = yield* sql.unsafe<ConstraintRow>(`
        select
          n.nspname as schema_name,
          c.relname as table_name,
          con.conname as constraint_name,
          con.contype as constraint_type,
          con.conkey as local_attnums,
          con.confkey as referenced_attnums,
          fn.nspname as referenced_schema_name,
          fc.relname as referenced_table_name,
          con.condeferrable as deferrable,
          con.condeferred as initially_deferred,
          case when con.contype = 'c' then pg_get_expr(con.conbin, con.conrelid, true) else null end as check_sql,
          con.connoinherit as no_inherit,
          coalesce(conind.indnullsnotdistinct, false) as nulls_not_distinct,
          con.confupdtype as on_update,
          con.confdeltype as on_delete
        from pg_constraint con
        join pg_class c on c.oid = con.conrelid
        join pg_namespace n on n.oid = c.relnamespace
        left join pg_class fc on fc.oid = con.confrelid
        left join pg_namespace fn on fn.oid = fc.relnamespace
        left join pg_index conind on conind.indexrelid = con.conindid
        where c.oid = any($1::oid[])
          and con.contype in ('p', 'u', 'f', 'c')
        order by n.nspname, c.relname, con.conname
      `, [tableOids])

      const indexes = yield* sql.unsafe<IndexRow>(`
        select
          n.nspname as schema_name,
          c.relname as table_name,
          idx.relname as index_name,
          idx.oid as index_oid,
          ind.indisunique as unique,
          am.amname as method,
          pg_get_expr(ind.indpred, ind.indrelid, true) as predicate_sql,
          ind.indnkeyatts as indnkeyatts,
          ind.indnatts as indnatts,
          ind.indkey::text as indkey,
          ind.indclass::text as indclass,
          ind.indcollation::text as indcollation,
          ind.indoption::text as indoption
        from pg_index ind
        join pg_class idx on idx.oid = ind.indexrelid
        join pg_class c on c.oid = ind.indrelid
        join pg_namespace n on n.oid = c.relnamespace
        join pg_am am on am.oid = idx.relam
        left join pg_constraint con on con.conindid = ind.indexrelid
        where c.oid = any($1::oid[])
          and not ind.indisprimary
          and con.oid is null
        order by n.nspname, c.relname, idx.relname
      `, [tableOids])

      const indexOids = indexes.map((index) => index.index_oid)
      const indexKeys = indexOids.length === 0
        ? []
        : yield* sql.unsafe<IndexKeyRow>(`
            select
              ind.indexrelid as index_oid,
              pos.n as position,
              pg_get_indexdef(ind.indexrelid, pos.n, true) as key_sql
            from pg_index ind
            cross join lateral generate_series(1, ind.indnkeyatts) as pos(n)
            where ind.indexrelid = any($1::oid[])
            order by ind.indexrelid, pos.n
          `, [indexOids])

      const opclassOids = indexes.flatMap((index) => parseVector(index.indclass))
      const opclassRows = opclassOids.length === 0
        ? []
        : yield* sql.unsafe<OpclassRow>(`
            select oid, opcdefault
            from pg_opclass
            where oid = any($1::oid[])
          `, [[...new Set(opclassOids)]])
      const opclassDefaults = new Map(opclassRows.map((row) => [row.oid, row.opcdefault]))
      const defaultCollationRow = yield* sql.unsafe<{ readonly oid: number }>(`
        select oid
        from pg_collation
        where collname = 'default'
          and collnamespace = 'pg_catalog'::regnamespace
        limit 1
      `)
      const defaultCollationOid = defaultCollationRow[0]?.oid ?? 0

      const enumTypeNames = columns
        .filter((column) => column.type_kind === "e")
        .map((column) => `${column.type_schema}.${column.db_type_kind}`)

      const enums = enumTypeNames.length === 0
        ? []
        : yield* sql.unsafe<EnumRow>(`
            select
              n.nspname as schema_name,
              t.typname as type_name,
              e.enumlabel as enum_label,
              e.enumsortorder as sort_order
            from pg_type t
            join pg_namespace n on n.oid = t.typnamespace
            join pg_enum e on e.enumtypid = t.oid
            where concat(n.nspname, '.', t.typname) = any($1::text[])
            order by n.nspname, t.typname, e.enumsortorder
          `, [[...new Set(enumTypeNames)]])

      const columnsByTable = new Map<string, ColumnModel[]>()
      const attnumByTable = new Map<string, Map<number, string>>()
      const attcollationByTable = new Map<string, Map<number, number>>()
      for (const column of columns) {
        const key = `${column.schema_name}.${column.table_name}`
        const list = columnsByTable.get(key) ?? []
        list.push(makeColumnModel(column))
        columnsByTable.set(key, list)
        const attnums = attnumByTable.get(key) ?? new Map<number, string>()
        attnums.set(column.attnum, column.column_name)
        attnumByTable.set(key, attnums)
        const attcollations = attcollationByTable.get(key) ?? new Map<number, number>()
        attcollations.set(column.attnum, column.attcollation_oid)
        attcollationByTable.set(key, attcollations)
      }

      const optionsByTable = new Map<string, TableOptionSpec[]>()
      for (const constraint of constraints) {
        const key = `${constraint.schema_name}.${constraint.table_name}`
        const list = optionsByTable.get(key) ?? []
        const attnums = attnumByTable.get(key) ?? new Map<number, string>()
        const localColumns = (constraint.local_attnums ?? []).map((attnum) => attnums.get(attnum)).filter((value): value is string => value !== undefined)
        switch (constraint.constraint_type) {
          case "p":
            list.push({
              kind: "primaryKey",
              name: constraint.constraint_name,
              columns: localColumns as [string, ...string[]],
              deferrable: constraint.deferrable,
              initiallyDeferred: constraint.initially_deferred
            })
            break
          case "u":
            list.push({
              kind: "unique",
              name: constraint.constraint_name,
              columns: localColumns as [string, ...string[]],
              nullsNotDistinct: constraint.nulls_not_distinct,
              deferrable: constraint.deferrable,
              initiallyDeferred: constraint.initially_deferred
            })
            break
          case "f": {
            const referencedKey = `${constraint.referenced_schema_name ?? "public"}.${constraint.referenced_table_name ?? ""}`
            const referencedAttnums = attnumByTable.get(referencedKey) ?? new Map<number, string>()
            const referencedColumns = (constraint.referenced_attnums ?? [])
              .map((attnum) => referencedAttnums.get(attnum))
              .filter((value): value is string => value !== undefined)
            list.push({
              kind: "foreignKey",
              name: constraint.constraint_name,
              columns: localColumns as [string, ...string[]],
              references: () => ({
                tableName: constraint.referenced_table_name ?? "",
                schemaName: constraint.referenced_schema_name ?? undefined,
                columns: referencedColumns as [string, ...string[]]
              }),
              onUpdate: parseAction(constraint.on_update),
              onDelete: parseAction(constraint.on_delete),
              deferrable: constraint.deferrable,
              initiallyDeferred: constraint.initially_deferred
            })
            break
          }
          case "c":
            if (constraint.check_sql === null) {
              throw new Error(`Missing check SQL for constraint '${constraint.constraint_name}'`)
            }
            list.push({
              kind: "check",
              name: constraint.constraint_name,
              predicate: parseExpression(constraint.check_sql, `check constraint ${constraint.constraint_name}`),
              noInherit: constraint.no_inherit
            })
            break
        }
        optionsByTable.set(key, list)
      }

      const keySqlByIndex = new Map<number, IndexKeyRow[]>()
      for (const key of indexKeys) {
        const list = keySqlByIndex.get(key.index_oid) ?? []
        list.push(key)
        keySqlByIndex.set(key.index_oid, list)
      }

      for (const index of indexes) {
        const key = `${index.schema_name}.${index.table_name}`
        const list = optionsByTable.get(key) ?? []
        const attnums = attnumByTable.get(key) ?? new Map<number, string>()
        const attcollations = attcollationByTable.get(key) ?? new Map<number, number>()
        const indkey = parseVector(index.indkey)
        const indclass = parseVector(index.indclass)
        const indcollation = parseVector(index.indcollation)
        const indoption = parseVector(index.indoption)
        const keys = (keySqlByIndex.get(index.index_oid) ?? []).map((entry) => {
          const attnum = indkey[entry.position - 1] ?? 0
          const opclass = indclass[entry.position - 1]
          const collation = indcollation[entry.position - 1]
          const optionBits = indoption[entry.position - 1] ?? 0
          const order = (optionBits & 1) === 1 ? "desc" : "asc"
          const nulls = (optionBits & 2) === 2 ? "first" : "last"
          const parsed = stripOrderingSuffix(entry.key_sql)
          if (opclass !== undefined && opclassDefaults.get(opclass) === false) {
            throw new Error(`Unsupported PostgreSQL index key definition '${entry.key_sql}' on ${index.index_name}`)
          }
          if (attnum > 0) {
            const columnName = attnums.get(attnum)
            if (columnName === undefined) {
              throw new Error(`Unknown index column attnum '${attnum}' on ${key}`)
            }
            const columnCollation = attcollations.get(attnum) ?? defaultCollationOid
            if (collation !== undefined && collation !== 0 && collation !== columnCollation) {
              throw new Error(`Unsupported PostgreSQL index collation on ${index.index_name}`)
            }
            if (!isSimpleIndexColumnReference(parsed.expressionSql, columnName)) {
              throw new Error(`Unsupported PostgreSQL index key definition '${entry.key_sql}' on ${index.index_name}`)
            }
            return {
              kind: "column" as const,
              column: columnName,
              order: parsed.order ?? order,
              nulls: parsed.nulls ?? nulls
            }
          }
          if (collation !== undefined && collation !== 0 && collation !== defaultCollationOid) {
            throw new Error(`Unsupported PostgreSQL index collation on ${index.index_name}`)
          }
          return {
            kind: "expression" as const,
            expression: parseExpression(parsed.expressionSql, `index ${index.index_name}`),
            order: parsed.order ?? order,
            nulls: parsed.nulls ?? nulls
          }
        })
        const include = indkey
          .slice(index.indnkeyatts, index.indnatts)
          .map((attnum) => attnums.get(attnum))
          .filter((value): value is string => value !== undefined)
        list.push({
          kind: "index",
          name: index.index_name,
          unique: index.unique,
          method: index.method,
          keys: keys as any,
          include,
          predicate: index.predicate_sql === null
            ? undefined
            : parseExpression(index.predicate_sql, `index predicate ${index.index_name}`)
        } as TableOptionSpec)
        optionsByTable.set(key, list)
      }

      const enumMap = new Map<string, EnumModel>()
      for (const enumRow of enums) {
        const key = `${enumRow.schema_name}.${enumRow.type_name}`
        const existing = enumMap.get(key)
        if (existing) {
          enumMap.set(key, {
            ...existing,
            values: [...existing.values, enumRow.enum_label]
          })
        } else {
          enumMap.set(key, {
            kind: "enum",
            schemaName: enumRow.schema_name,
            name: enumRow.type_name,
            values: [enumRow.enum_label]
          })
        }
      }

      const tableModels: TableModel[] = tables.map((table) => {
        const key = `${table.schema_name}.${table.table_name}`
        return {
          kind: "table",
          schemaName: table.schema_name,
          name: table.table_name,
          columns: columnsByTable.get(key) ?? [],
          options: optionsByTable.get(key) ?? []
        }
      })

      return {
        dialect: "postgres",
        enums: [...enumMap.values()],
        tables: tableModels
      } satisfies SchemaModel
    }))
