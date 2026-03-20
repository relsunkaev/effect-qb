import type { DatatypeFamilySpec, DatatypeKindSpec } from "../../internal/datatypes/shape.ts"

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

export type MysqlDatatypeFamily = keyof typeof mysqlDatatypeFamilies
export type MysqlDatatypeKind = keyof typeof mysqlDatatypeKinds
