import type { DatatypeFamilySpec, DatatypeKindSpec } from "../../internal/datatypes/shape.ts"

export const postgresDatatypeFamilies = {
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
      "interval",
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
      "interval",
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
  }
} as const satisfies Record<string, DatatypeFamilySpec>

export const postgresDatatypeKinds = {
  text: { family: "text", runtime: "string" },
  varchar: { family: "text", runtime: "string" },
  char: { family: "text", runtime: "string" },
  citext: { family: "text", runtime: "string" },
  uuid: { family: "uuid", runtime: "string" },
  int2: { family: "numeric", runtime: "number" },
  int4: { family: "numeric", runtime: "number" },
  int8: { family: "numeric", runtime: "bigint" },
  numeric: { family: "numeric", runtime: "number" },
  float4: { family: "numeric", runtime: "number" },
  float8: { family: "numeric", runtime: "number" },
  bool: { family: "boolean", runtime: "boolean" },
  date: { family: "date", runtime: "date" },
  time: { family: "time", runtime: "string" },
  timestamp: { family: "timestamp", runtime: "date" },
  interval: { family: "interval", runtime: "string" },
  bytea: { family: "binary", runtime: "bytes" },
  json: { family: "json", runtime: "unknown" },
  jsonb: { family: "json", runtime: "unknown" }
} as const satisfies Record<string, DatatypeKindSpec>

export type PostgresDatatypeFamily = keyof typeof postgresDatatypeFamilies
export type PostgresDatatypeKind = keyof typeof postgresDatatypeKinds
