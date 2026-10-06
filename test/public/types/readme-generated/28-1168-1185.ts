// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 1168-1185

// README.md:1168-1185
import { Scalar } from "effect-qb"
import * as Pg from "effect-qb/postgres"

// Adapt a custom driver's native bigint values to canonical integer strings.
// The column schema still determines the decoded result type.
const bigintAsString: Scalar.DriverValueMapping = {
  fromDriver: (value) => typeof value === "bigint" ? value.toString() : value,
  toDriver: (value) => value
}

const renderer = Pg.Renderer.make({
  valueMappings: {
    int8: bigintAsString
  }
})


export {};
