// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 1044-1063

// README.md:1044-1063
import { Scalar } from "effect-qb"
import * as Pg from "effect-qb/postgres"

const mapping: Scalar.DriverValueMapping = {
  fromDriver: (value) => value,
  toDriver: (value) => value,
  selectSql: (sql) => sql,
  jsonSelectSql: (sql) => sql
}

const renderer = Pg.Renderer.make({
  valueMappings: {
    text: mapping,
    jsonb: mapping,
    string: mapping
  }
})


export {};
