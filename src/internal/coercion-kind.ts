import type * as Expression from "../expression.ts"

export type CoercionKind =
  | "text"
  | "numeric"
  | "boolean"
  | "timestamp"
  | "uuid"
  | "json"
  | "null"
  | `other:${string}`

type NormalizeKind<
  Dialect extends string,
  Kind extends string
> =
  Kind extends "null"
    ? "null"
    : Kind extends "text"
      ? "text"
      : Dialect extends "postgres"
        ? Kind extends "int4" | "numeric"
          ? "numeric"
          : Kind extends "bool"
            ? "boolean"
            : Kind extends "timestamp"
              ? "timestamp"
              : Kind extends "uuid"
                ? "uuid"
                : Kind extends "json"
                  ? "json"
                  : `other:${Dialect}:${Kind}`
        : Dialect extends "mysql"
          ? Kind extends "int" | "decimal"
            ? "numeric"
            : Kind extends "boolean"
              ? "boolean"
              : Kind extends "timestamp"
                ? "timestamp"
                : Kind extends "uuid"
                  ? "uuid"
                  : Kind extends "json"
                    ? "json"
                    : `other:${Dialect}:${Kind}`
          : Kind extends "numeric" | "decimal" | "int" | "int4"
            ? "numeric"
            : Kind extends "bool" | "boolean"
              ? "boolean"
              : Kind extends "timestamp"
                ? "timestamp"
                : Kind extends "uuid"
                  ? "uuid"
                  : Kind extends "json"
                    ? "json"
                    : `other:${Dialect}:${Kind}`

export type CoercionKindOf<Db extends Expression.DbType.Any> =
  Db extends Expression.DbType.Base<infer Dialect extends string, infer Kind extends string>
    ? NormalizeKind<Dialect, Kind>
    : never
