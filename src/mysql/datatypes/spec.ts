import type { DatatypeFamilySpec, DatatypeKindSpec } from "../../internal/datatypes/shape.ts"

export const mysqlDatatypeFamilies = {
  text: {
    compareGroup: "text",
    castTargets: [
      "text",
      "uuid",
      "numeric",
      "boolean",
      "date",
      "time",
      "timestamp",
      "binary",
      "json"
    ],
    traits: {
      textual: true,
      ordered: true
    }
  },
  null: {
    compareGroup: "null",
    castTargets: [
      "text",
      "uuid",
      "numeric",
      "boolean",
      "date",
      "time",
      "timestamp",
      "binary",
      "json",
      "null"
    ],
    traits: {}
  },
  numeric: {
    compareGroup: "numeric",
    castTargets: ["numeric", "text"],
    traits: {
      ordered: true
    }
  },
  boolean: {
    compareGroup: "boolean",
    castTargets: ["boolean", "text"],
    traits: {}
  },
  date: {
    compareGroup: "temporal",
    castTargets: ["date", "timestamp", "text"],
    traits: {
      ordered: true
    }
  },
  time: {
    compareGroup: "time",
    castTargets: ["time", "text"],
    traits: {
      ordered: true
    }
  },
  timestamp: {
    compareGroup: "temporal",
    castTargets: ["timestamp", "date", "text"],
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
  }
} as const satisfies Record<string, DatatypeFamilySpec>

export const mysqlDatatypeKinds = {
  text: { family: "text", runtime: "string" },
  varchar: { family: "text", runtime: "string" },
  char: { family: "text", runtime: "string" },
  uuid: { family: "uuid", runtime: "string" },
  tinyint: { family: "numeric", runtime: "number" },
  smallint: { family: "numeric", runtime: "number" },
  mediumint: { family: "numeric", runtime: "number" },
  int: { family: "numeric", runtime: "number" },
  bigint: { family: "numeric", runtime: "bigint" },
  decimal: { family: "numeric", runtime: "number" },
  float: { family: "numeric", runtime: "number" },
  double: { family: "numeric", runtime: "number" },
  boolean: { family: "boolean", runtime: "boolean" },
  date: { family: "date", runtime: "date" },
  time: { family: "time", runtime: "string" },
  datetime: { family: "timestamp", runtime: "date" },
  timestamp: { family: "timestamp", runtime: "date" },
  binary: { family: "binary", runtime: "bytes" },
  varbinary: { family: "binary", runtime: "bytes" },
  blob: { family: "binary", runtime: "bytes" },
  json: { family: "json", runtime: "unknown" }
} as const satisfies Record<string, DatatypeKindSpec>

export type MysqlDatatypeFamily = keyof typeof mysqlDatatypeFamilies
export type MysqlDatatypeKind = keyof typeof mysqlDatatypeKinds
