import { describe, expect, test } from "bun:test"

import { Query as Q } from "../src/index.ts"

describe("query capabilities", () => {
  test("union_query_capabilities dedupes while preserving first-seen order", () => {
    expect(Q.union_query_capabilities(["read"], ["write", "read"], ["write"])).toEqual([
      "read",
      "write"
    ])
  })
})
