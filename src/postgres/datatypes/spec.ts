import type { DatatypeFamilySpec, DatatypeKindSpec } from "../../internal/datatypes/shape.ts"

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
  int8: { family: "numeric", runtime: "bigint" },
  numeric: { family: "numeric", runtime: "number" },
  float4: { family: "numeric", runtime: "number" },
  float8: { family: "numeric", runtime: "number" },
  money: { family: "money", runtime: "number" },
  bool: { family: "boolean", runtime: "boolean" },
  date: { family: "date", runtime: "date" },
  time: { family: "time", runtime: "string" },
  timetz: { family: "time", runtime: "string" },
  timestamp: { family: "timestamp", runtime: "date" },
  timestamptz: { family: "timestamp", runtime: "date" },
  interval: { family: "interval", runtime: "string" },
  bytea: { family: "binary", runtime: "bytes" },
  json: { family: "json", runtime: "unknown" },
  jsonb: { family: "json", runtime: "unknown" },
  xml: { family: "xml", runtime: "string" },
  bit: { family: "bit", runtime: "string" },
  varbit: { family: "bit", runtime: "string" },
  oid: { family: "oid", runtime: "number" },
  xid: { family: "oid", runtime: "number" },
  xid8: { family: "oid", runtime: "bigint" },
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

export type PostgresDatatypeFamily = keyof typeof postgresDatatypeFamilies
export type PostgresDatatypeKind = keyof typeof postgresDatatypeKinds
