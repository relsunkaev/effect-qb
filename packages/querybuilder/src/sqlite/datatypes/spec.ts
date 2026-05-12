import type { DatatypeFamilySpec, DatatypeKindSpec } from "../../internal/datatypes/shape.js"

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

export type SqliteDatatypeFamily = keyof typeof sqliteDatatypeFamilies
export type SqliteDatatypeKind = keyof typeof sqliteDatatypeKinds
