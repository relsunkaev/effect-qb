// Generated from README.md.
// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.
// Code fences: 1427-1435

// README.md:1427-1435
import { Query } from "effect-qb"

const begin = Query.transaction({ isolationLevel: "serializable" })
const savepoint = Query.savepoint("before_merge")
const rollbackToSavepoint = Query.rollbackTo("before_merge")
const releaseSavepoint = Query.releaseSavepoint("before_merge")
const commit = Query.commit()

export {};
