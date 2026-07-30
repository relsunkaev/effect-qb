import type * as ExpressionAst from "./expression-ast.js"

const renderBoundary = (
  boundary: ExpressionAst.WindowFrameBoundary
): string => {
  if (boundary === "unboundedPreceding") {
    return "unbounded preceding"
  }
  if (boundary === "currentRow") {
    return "current row"
  }
  if (boundary === "unboundedFollowing") {
    return "unbounded following"
  }
  if ("preceding" in boundary) {
    return `${boundary.preceding} preceding`
  }
  return `${boundary.following} following`
}

export const renderWindowFrame = (
  frame: ExpressionAst.WindowFrameNode
): string => frame.end === undefined
  ? `${frame.unit} ${renderBoundary(frame.start)}`
  : `${frame.unit} between ${renderBoundary(frame.start)} and ${renderBoundary(frame.end)}`
