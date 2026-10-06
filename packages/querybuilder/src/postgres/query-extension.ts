/**
 * Postgres-only query extensions.
 * Portable builders: import { Query } from "effect-qb".
 * Source: ../standard/query.ts
 */
export { distinctOn, generateSeries, onConflict } from "./internal/query.js"
