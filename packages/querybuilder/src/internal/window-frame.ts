import type * as ExpressionAst from "./expression-ast.js"

const validateBoundary = (
  boundary: ExpressionAst.WindowFrameBoundary
): void => {
  if (typeof boundary === "object") {
    const value = "preceding" in boundary ? boundary.preceding : boundary.following
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error("window frame offsets must be non-negative safe integers")
    }
  }
}

export const validateWindowFrame = (
  frame: ExpressionAst.WindowFrameNode | undefined
): void => {
  if (frame === undefined) {
    return
  }
  validateBoundary(frame.start)
  if (frame.end !== undefined) {
    validateBoundary(frame.end)
  }
  if (frame.start === "unboundedFollowing") {
    throw new Error("window frame cannot start with unbounded following")
  }
  if (frame.end === "unboundedPreceding") {
    throw new Error("window frame cannot end with unbounded preceding")
  }
}
