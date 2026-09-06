import type { DbType } from "../scalar.js"

// Descriptors are created by the datatype constructors. These guards expose
// their structural variants without making every generic constraint a union.
export const isDomain = (db: DbType.Any): db is DbType.Domain<string, DbType.Any, string> =>
  "base" in db

export const isArray = (db: DbType.Any): db is DbType.Array<string, DbType.Any, string> =>
  "element" in db

export const isComposite = (db: DbType.Any): db is DbType.Composite<string, Record<string, DbType.Any>, string> =>
  "fields" in db

export const hasSubtype = (db: DbType.Any): db is DbType.Range<string, DbType.Any, string> =>
  "subtype" in db
