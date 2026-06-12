import type { DatatypeFamilySpec, DatatypeKindSpec } from "./shape.js"

export type MatrixDialect = "standard" | "postgres" | "mysql" | "sqlite"

export const portableDatatypeFamilies = {
  uuid: {
    compareGroup: "uuid",
    castTargets: ["uuid", "char", "varchar", "text"],
    traits: {
      textual: true
    }
  },
  text: {
    compareGroup: "text",
    castTargets: [
      "text",
      "numeric",
      "integer",
      "real",
      "boolean",
      "date",
      "time",
      "datetime",
      "interval",
      "uuid",
      "json",
      "blob",
      "binary",
      "array",
      "range",
      "multirange",
      "record",
      "enum",
      "set",
      "money",
      "null"
    ],
    traits: {
      textual: true,
      ordered: true
    }
  },
  numeric: {
    compareGroup: "numeric",
    castTargets: ["numeric", "integer", "real", "text", "boolean", "date", "time", "datetime"],
    traits: {
      ordered: true
    }
  },
  integer: {
    compareGroup: "numeric",
    castTargets: ["integer", "numeric", "real", "text", "boolean", "date", "time", "datetime"],
    traits: {
      ordered: true
    }
  },
  real: {
    compareGroup: "numeric",
    castTargets: ["real", "numeric", "integer", "text", "boolean"],
    traits: {
      ordered: true
    }
  },
  boolean: {
    compareGroup: "boolean",
    castTargets: ["boolean", "integer", "numeric", "text"],
    traits: {}
  },
  date: {
    compareGroup: "date",
    castTargets: ["date", "time", "datetime", "text", "numeric", "integer"],
    traits: {
      ordered: true
    }
  },
  time: {
    compareGroup: "time",
    castTargets: ["time", "date", "datetime", "text", "numeric", "integer"],
    traits: {
      ordered: true
    }
  },
  datetime: {
    compareGroup: "datetime",
    castTargets: ["datetime", "date", "time", "text", "numeric", "integer"],
    traits: {
      ordered: true
    }
  },
  json: {
    compareGroup: "json",
    castTargets: ["json", "text"],
    traits: {}
  },
  blob: {
    compareGroup: "blob",
    castTargets: ["blob", "text"],
    traits: {}
  },
  null: {
    compareGroup: "null",
    castTargets: ["uuid", "text", "numeric", "integer", "real", "boolean", "date", "time", "datetime", "json", "blob", "null"],
    traits: {}
  }
} as const satisfies Record<string, DatatypeFamilySpec>

export const portableDatatypeKinds = {
  uuid: { family: "uuid", runtime: "string" },
  text: { family: "text", runtime: "string" },
  varchar: { family: "text", runtime: "string" },
  char: { family: "text", runtime: "string" },
  int: { family: "integer", runtime: "number" },
  integer: { family: "integer", runtime: "number" },
  bigint: { family: "integer", runtime: "bigintString" },
  numeric: { family: "numeric", runtime: "decimalString" },
  decimal: { family: "numeric", runtime: "decimalString" },
  real: { family: "real", runtime: "number" },
  boolean: { family: "boolean", runtime: "boolean" },
  date: { family: "date", runtime: "localDate" },
  time: { family: "time", runtime: "localTime" },
  datetime: { family: "datetime", runtime: "localDateTime" },
  timestamp: { family: "datetime", runtime: "localDateTime" },
  json: { family: "json", runtime: "json" },
  blob: { family: "blob", runtime: "bytes" }
} as const satisfies Record<string, DatatypeKindSpec>

export type PortableDatatypeFamily = keyof typeof portableDatatypeFamilies
export type PortableDatatypeKind = keyof typeof portableDatatypeKinds

export const portableDatatypeKeys = Object.keys(portableDatatypeKinds) as ReadonlyArray<PortableDatatypeKind>

export const portableDatatypeDdlTypeByDialect = {
  standard: {
    uuid: "uuid",
    text: "text",
    varchar: "varchar",
    char: "char",
    int: "int",
    integer: "integer",
    bigint: "bigint",
    numeric: "numeric",
    decimal: "decimal",
    real: "real",
    boolean: "boolean",
    date: "date",
    time: "time",
    datetime: "datetime",
    timestamp: "timestamp",
    json: "json",
    blob: "blob"
  },
  postgres: {
    uuid: "uuid",
    text: "text",
    varchar: "varchar",
    char: "char",
    int: "int",
    integer: "integer",
    bigint: "bigint",
    numeric: "numeric",
    decimal: "decimal",
    real: "real",
    boolean: "boolean",
    date: "date",
    time: "time",
    datetime: "timestamp",
    timestamp: "timestamp",
    json: "json",
    blob: "bytea"
  },
  mysql: {
    uuid: "char(36)",
    text: "text",
    varchar: "varchar",
    char: "char",
    int: "int",
    integer: "integer",
    bigint: "bigint",
    numeric: "numeric",
    decimal: "decimal",
    real: "real",
    boolean: "boolean",
    date: "date",
    time: "time",
    datetime: "datetime",
    timestamp: "timestamp",
    json: "json",
    blob: "blob"
  },
  sqlite: {
    uuid: "text",
    text: "text",
    varchar: "varchar",
    char: "char",
    int: "int",
    integer: "integer",
    bigint: "bigint",
    numeric: "numeric",
    decimal: "decimal",
    real: "real",
    boolean: "boolean",
    date: "date",
    time: "time",
    datetime: "datetime",
    timestamp: "datetime",
    json: "json",
    blob: "blob"
  }
} as const satisfies Record<MatrixDialect, Record<PortableDatatypeKind, string>>

export const portableDatatypeCastTypeByDialect = {
  standard: portableDatatypeDdlTypeByDialect.standard,
  postgres: portableDatatypeDdlTypeByDialect.postgres,
  mysql: {
    ...portableDatatypeDdlTypeByDialect.mysql,
    text: "char",
    varchar: "char",
    char: "char",
    numeric: "decimal",
    decimal: "decimal",
    datetime: "datetime",
    timestamp: "datetime"
  },
  sqlite: {
    ...portableDatatypeDdlTypeByDialect.sqlite,
    uuid: "text",
    int: "integer",
    timestamp: "datetime"
  }
} as const satisfies Record<MatrixDialect, Record<PortableDatatypeKind, string>>

const hasOwn = <Key extends PropertyKey>(
  value: object,
  key: Key
): key is Key & keyof typeof value =>
  Object.prototype.hasOwnProperty.call(value, key)

export const renderPortableDatatypeDdlType = (
  dialect: string,
  kind: string
): string | undefined => {
  if (!hasOwn(portableDatatypeDdlTypeByDialect, dialect)) {
    return undefined
  }
  const byKind = portableDatatypeDdlTypeByDialect[dialect]
  return hasOwn(byKind, kind) ? byKind[kind] : undefined
}

export const renderPortableDatatypeCastType = (
  dialect: string,
  kind: string
): string | undefined => {
  if (!hasOwn(portableDatatypeCastTypeByDialect, dialect)) {
    return undefined
  }
  const byKind = portableDatatypeCastTypeByDialect[dialect]
  return hasOwn(byKind, kind) ? byKind[kind] : undefined
}

export const postgresDatatypeFamilies = {
  text: {
    compareGroup: "text",
    castTargets: [
      "text",
      "numeric",
      "boolean",
      "date",
      "time",
      "timestamp",
      "interval",
      "binary",
      "uuid",
      "json",
      "xml",
      "bit",
      "oid",
      "identifier",
      "network",
      "spatial",
      "textsearch",
      "range",
      "multirange",
      "array",
      "money",
      "null"
    ],
    traits: {
      textual: true,
      ordered: true
    }
  },
  numeric: {
    compareGroup: "numeric",
    castTargets: ["numeric", "text", "boolean", "date", "time", "timestamp", "interval", "uuid", "bit", "oid", "money"],
    traits: {
      ordered: true
    }
  },
  boolean: {
    compareGroup: "boolean",
    castTargets: ["boolean", "text", "numeric"],
    traits: {}
  },
  date: {
    compareGroup: "date",
    castTargets: ["date", "timestamp", "text"],
    traits: {
      ordered: true
    }
  },
  time: {
    compareGroup: "time",
    castTargets: ["time", "timestamp", "text"],
    traits: {
      ordered: true
    }
  },
  timestamp: {
    compareGroup: "timestamp",
    castTargets: ["timestamp", "date", "text"],
    traits: {
      ordered: true
    }
  },
  interval: {
    compareGroup: "interval",
    castTargets: ["interval", "text"],
    traits: {
      ordered: true
    }
  },
  binary: {
    compareGroup: "binary",
    castTargets: ["binary", "text"],
    traits: {}
  },
  uuid: {
    compareGroup: "uuid",
    castTargets: ["uuid", "text"],
    traits: {
      ordered: true
    }
  },
  json: {
    compareGroup: "json",
    castTargets: ["json", "text"],
    traits: {}
  },
  xml: {
    compareGroup: "xml",
    castTargets: ["xml", "text"],
    traits: {}
  },
  bit: {
    compareGroup: "bit",
    castTargets: ["bit", "text", "numeric"],
    traits: {}
  },
  oid: {
    compareGroup: "oid",
    castTargets: ["oid", "text", "numeric"],
    traits: {
      ordered: true
    }
  },
  identifier: {
    compareGroup: "identifier",
    castTargets: ["identifier", "text"],
    traits: {}
  },
  network: {
    compareGroup: "network",
    castTargets: ["network", "text"],
    traits: {}
  },
  spatial: {
    compareGroup: "spatial",
    castTargets: ["spatial", "text"],
    traits: {}
  },
  textsearch: {
    compareGroup: "textsearch",
    castTargets: ["textsearch", "text"],
    traits: {}
  },
  range: {
    compareGroup: "range",
    castTargets: ["range", "text"],
    traits: {}
  },
  multirange: {
    compareGroup: "multirange",
    castTargets: ["multirange", "text"],
    traits: {}
  },
  enum: {
    compareGroup: "enum",
    castTargets: ["enum", "text"],
    traits: {
      textual: true,
      ordered: true
    }
  },
  record: {
    compareGroup: "record",
    castTargets: ["record", "text"],
    traits: {}
  },
  array: {
    compareGroup: "array",
    castTargets: ["array", "text"],
    traits: {}
  },
  money: {
    compareGroup: "money",
    castTargets: ["money", "text", "numeric"],
    traits: {
      ordered: true
    }
  },
  null: {
    compareGroup: "null",
    castTargets: [
      "text",
      "numeric",
      "boolean",
      "date",
      "time",
      "timestamp",
      "interval",
      "binary",
      "uuid",
      "json",
      "xml",
      "bit",
      "oid",
      "identifier",
      "network",
      "spatial",
      "textsearch",
      "range",
      "multirange",
      "array",
      "money",
      "null"
    ],
    traits: {}
  }
} as const satisfies Record<string, DatatypeFamilySpec>

export const postgresDatatypeKinds = {
  text: { family: "text", runtime: "string" },
  varchar: { family: "text", runtime: "string" },
  char: { family: "text", runtime: "string" },
  citext: { family: "text", runtime: "string" },
  name: { family: "text", runtime: "string" },
  uuid: { family: "uuid", runtime: "string" },
  int2: { family: "numeric", runtime: "number" },
  int4: { family: "numeric", runtime: "number" },
  int8: { family: "numeric", runtime: "bigintString" },
  numeric: { family: "numeric", runtime: "decimalString" },
  float4: { family: "numeric", runtime: "number" },
  float8: { family: "numeric", runtime: "number" },
  money: { family: "money", runtime: "number" },
  bool: { family: "boolean", runtime: "boolean" },
  date: { family: "date", runtime: "localDate" },
  time: { family: "time", runtime: "localTime" },
  timetz: { family: "time", runtime: "offsetTime" },
  timestamp: { family: "timestamp", runtime: "localDateTime" },
  timestamptz: { family: "timestamp", runtime: "instant" },
  interval: { family: "interval", runtime: "string" },
  bytea: { family: "binary", runtime: "bytes" },
  json: { family: "json", runtime: "json" },
  jsonb: { family: "json", runtime: "json" },
  xml: { family: "xml", runtime: "string" },
  bit: { family: "bit", runtime: "string" },
  varbit: { family: "bit", runtime: "string" },
  oid: { family: "oid", runtime: "number" },
  xid: { family: "oid", runtime: "number" },
  xid8: { family: "oid", runtime: "bigintString" },
  cid: { family: "oid", runtime: "number" },
  tid: { family: "identifier", runtime: "string" },
  regclass: { family: "identifier", runtime: "string" },
  regtype: { family: "identifier", runtime: "string" },
  regproc: { family: "identifier", runtime: "string" },
  regprocedure: { family: "identifier", runtime: "string" },
  regoper: { family: "identifier", runtime: "string" },
  regoperator: { family: "identifier", runtime: "string" },
  regconfig: { family: "identifier", runtime: "string" },
  regdictionary: { family: "identifier", runtime: "string" },
  pg_lsn: { family: "identifier", runtime: "string" },
  txid_snapshot: { family: "identifier", runtime: "string" },
  inet: { family: "network", runtime: "string" },
  cidr: { family: "network", runtime: "string" },
  macaddr: { family: "network", runtime: "string" },
  macaddr8: { family: "network", runtime: "string" },
  point: { family: "spatial", runtime: "unknown" },
  line: { family: "spatial", runtime: "unknown" },
  lseg: { family: "spatial", runtime: "unknown" },
  box: { family: "spatial", runtime: "unknown" },
  path: { family: "spatial", runtime: "unknown" },
  polygon: { family: "spatial", runtime: "unknown" },
  circle: { family: "spatial", runtime: "unknown" },
  tsvector: { family: "textsearch", runtime: "string" },
  tsquery: { family: "textsearch", runtime: "string" },
  int4range: { family: "range", runtime: "unknown" },
  int8range: { family: "range", runtime: "unknown" },
  numrange: { family: "range", runtime: "unknown" },
  tsrange: { family: "range", runtime: "unknown" },
  tstzrange: { family: "range", runtime: "unknown" },
  daterange: { family: "range", runtime: "unknown" },
  int4multirange: { family: "multirange", runtime: "unknown" },
  int8multirange: { family: "multirange", runtime: "unknown" },
  nummultirange: { family: "multirange", runtime: "unknown" },
  tsmultirange: { family: "multirange", runtime: "unknown" },
  tstzmultirange: { family: "multirange", runtime: "unknown" },
  datemultirange: { family: "multirange", runtime: "unknown" }
} as const satisfies Record<string, DatatypeKindSpec>

export const postgresSpecificDatatypeKeys = [
  "int2",
  "int4",
  "int8",
  "float4",
  "float8",
  "money",
  "bool",
  "timetz",
  "timestamptz",
  "interval",
  "bytea",
  "citext",
  "name",
  "jsonb",
  "xml",
  "bit",
  "varbit",
  "oid",
  "xid",
  "xid8",
  "cid",
  "tid",
  "regclass",
  "regtype",
  "regproc",
  "regprocedure",
  "regoper",
  "regoperator",
  "regconfig",
  "regdictionary",
  "pg_lsn",
  "txid_snapshot",
  "inet",
  "cidr",
  "macaddr",
  "macaddr8",
  "point",
  "line",
  "lseg",
  "box",
  "path",
  "polygon",
  "circle",
  "tsvector",
  "tsquery",
  "int4range",
  "int8range",
  "numrange",
  "tsrange",
  "tstzrange",
  "daterange",
  "int4multirange",
  "int8multirange",
  "nummultirange",
  "tsmultirange",
  "tstzmultirange",
  "datemultirange"
] as const satisfies ReadonlyArray<keyof typeof postgresDatatypeKinds>

export type PostgresSpecificDatatypeKey = typeof postgresSpecificDatatypeKeys[number]

export const mysqlDatatypeFamilies = {
  text: {
    compareGroup: "text",
    castTargets: [
      "text",
      "numeric",
      "boolean",
      "date",
      "time",
      "datetime",
      "timestamp",
      "year",
      "binary",
      "json",
      "bit",
      "enum",
      "set",
      "null"
    ],
    traits: {
      textual: true,
      ordered: true
    }
  },
  numeric: {
    compareGroup: "numeric",
    castTargets: ["numeric", "text", "boolean", "date", "time", "datetime", "timestamp", "year", "bit"],
    traits: {
      ordered: true
    }
  },
  boolean: {
    compareGroup: "boolean",
    castTargets: ["boolean", "text", "numeric"],
    traits: {}
  },
  bit: {
    compareGroup: "bit",
    castTargets: ["bit", "text", "numeric"],
    traits: {}
  },
  date: {
    compareGroup: "date",
    castTargets: ["date", "datetime", "timestamp", "text"],
    traits: {
      ordered: true
    }
  },
  time: {
    compareGroup: "time",
    castTargets: ["time", "datetime", "timestamp", "text"],
    traits: {
      ordered: true
    }
  },
  datetime: {
    compareGroup: "datetime",
    castTargets: ["datetime", "timestamp", "date", "text"],
    traits: {
      ordered: true
    }
  },
  timestamp: {
    compareGroup: "timestamp",
    castTargets: ["timestamp", "datetime", "date", "text"],
    traits: {
      ordered: true
    }
  },
  year: {
    compareGroup: "year",
    castTargets: ["year", "text", "numeric"],
    traits: {
      ordered: true
    }
  },
  binary: {
    compareGroup: "binary",
    castTargets: ["binary", "text"],
    traits: {}
  },
  json: {
    compareGroup: "json",
    castTargets: ["json", "text"],
    traits: {}
  },
  spatial: {
    compareGroup: "spatial",
    castTargets: ["spatial", "text"],
    traits: {}
  },
  enum: {
    compareGroup: "enum",
    castTargets: ["enum", "text"],
    traits: {
      textual: true,
      ordered: true
    }
  },
  set: {
    compareGroup: "set",
    castTargets: ["set", "text"],
    traits: {
      textual: true
    }
  },
  null: {
    compareGroup: "null",
    castTargets: [
      "text",
      "numeric",
      "boolean",
      "bit",
      "date",
      "time",
      "datetime",
      "timestamp",
      "year",
      "binary",
      "json",
      "spatial",
      "enum",
      "set",
      "null"
    ],
    traits: {}
  }
} as const satisfies Record<string, DatatypeFamilySpec>

export const mysqlDatatypeKinds = {
  char: { family: "text", runtime: "string" },
  varchar: { family: "text", runtime: "string" },
  tinytext: { family: "text", runtime: "string" },
  text: { family: "text", runtime: "string" },
  mediumtext: { family: "text", runtime: "string" },
  longtext: { family: "text", runtime: "string" },
  tinyint: { family: "numeric", runtime: "number" },
  smallint: { family: "numeric", runtime: "number" },
  mediumint: { family: "numeric", runtime: "number" },
  int: { family: "numeric", runtime: "number" },
  integer: { family: "numeric", runtime: "number" },
  bigint: { family: "numeric", runtime: "bigintString" },
  decimal: { family: "numeric", runtime: "decimalString" },
  dec: { family: "numeric", runtime: "decimalString" },
  numeric: { family: "numeric", runtime: "decimalString" },
  fixed: { family: "numeric", runtime: "decimalString" },
  float: { family: "numeric", runtime: "number" },
  double: { family: "numeric", runtime: "number" },
  real: { family: "numeric", runtime: "number" },
  bool: { family: "boolean", runtime: "boolean" },
  boolean: { family: "boolean", runtime: "boolean" },
  bit: { family: "bit", runtime: "string" },
  date: { family: "date", runtime: "localDate" },
  time: { family: "time", runtime: "localTime" },
  datetime: { family: "datetime", runtime: "localDateTime" },
  timestamp: { family: "timestamp", runtime: "localDateTime" },
  year: { family: "year", runtime: "year" },
  binary: { family: "binary", runtime: "bytes" },
  varbinary: { family: "binary", runtime: "bytes" },
  tinyblob: { family: "binary", runtime: "bytes" },
  blob: { family: "binary", runtime: "bytes" },
  mediumblob: { family: "binary", runtime: "bytes" },
  longblob: { family: "binary", runtime: "bytes" },
  json: { family: "json", runtime: "json" },
  geometry: { family: "spatial", runtime: "unknown" },
  point: { family: "spatial", runtime: "unknown" },
  linestring: { family: "spatial", runtime: "unknown" },
  polygon: { family: "spatial", runtime: "unknown" },
  multipoint: { family: "spatial", runtime: "unknown" },
  multilinestring: { family: "spatial", runtime: "unknown" },
  multipolygon: { family: "spatial", runtime: "unknown" },
  geometrycollection: { family: "spatial", runtime: "unknown" },
  enum: { family: "enum", runtime: "string" },
  set: { family: "set", runtime: "string" }
} as const satisfies Record<string, DatatypeKindSpec>

export const mysqlSpecificDatatypeKeys = [
  "tinytext",
  "mediumtext",
  "longtext",
  "tinyint",
  "smallint",
  "mediumint",
  "dec",
  "fixed",
  "float",
  "double",
  "bool",
  "bit",
  "year",
  "binary",
  "varbinary",
  "tinyblob",
  "mediumblob",
  "longblob",
  "geometry",
  "point",
  "linestring",
  "polygon",
  "multipoint",
  "multilinestring",
  "multipolygon",
  "geometrycollection"
] as const satisfies ReadonlyArray<keyof typeof mysqlDatatypeKinds>

export type MysqlSpecificDatatypeKey = typeof mysqlSpecificDatatypeKeys[number]

export const sqliteDatatypeFamilies = {
  text: {
    compareGroup: "text",
    castTargets: ["text", "numeric", "integer", "real", "boolean", "date", "time", "datetime", "json", "blob", "null"],
    traits: {
      textual: true,
      ordered: true
    }
  },
  numeric: {
    compareGroup: "numeric",
    castTargets: ["numeric", "integer", "real", "text", "boolean", "date", "time", "datetime"],
    traits: {
      ordered: true
    }
  },
  integer: {
    compareGroup: "numeric",
    castTargets: ["integer", "numeric", "real", "text", "boolean", "date", "time", "datetime"],
    traits: {
      ordered: true
    }
  },
  real: {
    compareGroup: "numeric",
    castTargets: ["real", "numeric", "integer", "text", "boolean"],
    traits: {
      ordered: true
    }
  },
  boolean: {
    compareGroup: "boolean",
    castTargets: ["boolean", "integer", "numeric", "text"],
    traits: {}
  },
  date: {
    compareGroup: "date",
    castTargets: ["date", "time", "datetime", "text", "numeric", "integer"],
    traits: {
      ordered: true
    }
  },
  time: {
    compareGroup: "time",
    castTargets: ["time", "date", "datetime", "text", "numeric", "integer"],
    traits: {
      ordered: true
    }
  },
  datetime: {
    compareGroup: "datetime",
    castTargets: ["datetime", "date", "time", "text", "numeric", "integer"],
    traits: {
      ordered: true
    }
  },
  json: {
    compareGroup: "json",
    castTargets: ["json", "text"],
    traits: {}
  },
  blob: {
    compareGroup: "blob",
    castTargets: ["blob", "text"],
    traits: {}
  },
  null: {
    compareGroup: "null",
    castTargets: ["text", "numeric", "integer", "real", "boolean", "date", "time", "datetime", "json", "blob", "null"],
    traits: {}
  }
} as const satisfies Record<string, DatatypeFamilySpec>

export const sqliteDatatypeKinds = {
  text: { family: "text", runtime: "string" },
  varchar: { family: "text", runtime: "string" },
  char: { family: "text", runtime: "string" },
  clob: { family: "text", runtime: "string" },
  int: { family: "integer", runtime: "number" },
  integer: { family: "integer", runtime: "number" },
  bigint: { family: "integer", runtime: "bigintString" },
  numeric: { family: "numeric", runtime: "decimalString" },
  decimal: { family: "numeric", runtime: "decimalString" },
  real: { family: "real", runtime: "number" },
  double: { family: "real", runtime: "number" },
  boolean: { family: "boolean", runtime: "boolean" },
  date: { family: "date", runtime: "localDate" },
  time: { family: "time", runtime: "localTime" },
  datetime: { family: "datetime", runtime: "localDateTime" },
  timestamp: { family: "datetime", runtime: "localDateTime" },
  json: { family: "json", runtime: "json" },
  blob: { family: "blob", runtime: "bytes" }
} as const satisfies Record<string, DatatypeKindSpec>

export const sqliteSpecificDatatypeKeys = [
  "clob",
  "double"
] as const satisfies ReadonlyArray<keyof typeof sqliteDatatypeKinds>

export type SqliteSpecificDatatypeKey = typeof sqliteSpecificDatatypeKeys[number]

export const pickDatatypeConstructors = <
  Module extends Record<string, unknown>,
  Keys extends ReadonlyArray<keyof Module & string>
>(
  module: Module,
  keys: Keys
): Pick<Module, Keys[number]> =>
  Object.fromEntries(keys.map((key) => [key, module[key]])) as Pick<Module, Keys[number]>
