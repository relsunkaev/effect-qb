import { lock } from "./internal/query.js"

/** MySQL-only mutation modifier for UPDATE IGNORE. */
export const ignore = lock("ignore")

/** MySQL-only mutation modifier for DELETE QUICK. */
export const quick = lock("quick")

/** MySQL-only mutation modifier for LOW_PRIORITY mutations. */
export const lowPriority = lock("lowPriority")

/** MySQL-only mutation ordering and limiting. */
export { orderBy, limit } from "./internal/query.js"

/** MySQL-only multi-target mutation forms. */
export { update, delete } from "./internal/query.js"
