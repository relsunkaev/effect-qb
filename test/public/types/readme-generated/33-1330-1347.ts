// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 1330-1347

// README.md:1330-1347
import { Scalar } from "effect-qb"
import * as Pg from "effect-qb/postgres"

// The pg driver returns int8 (bigint) columns as strings. Decode them to a
// JavaScript BigInt on the way out, and encode back to a string on the way in.
const bigintAsString: Scalar.DriverValueMapping = {
  fromDriver: (value) => typeof value === "string" ? BigInt(value) : value,
  toDriver: (value) => typeof value === "bigint" ? value.toString() : value
}

const renderer = Pg.Renderer.make({
  valueMappings: {
    int8: bigintAsString
  }
})


export {};
