# TypeScript compiler API evaluation

Decision for `effect-qb-7qz`: retain the existing TypeScript 6 runtime dependency.
Continue native `tsgo` typechecking. Do not migrate source discovery to the
TypeScript 7.0 unstable API merely to match the compiler's major version.

## Actual caller

`packages/database/src/internal/postgres-source-discovery.ts` is the sole
runtime importer of `typescript`. It parses supplied text, recognizes imports
and top-level table/enum declarations, walks expressions, and records source
spans. It uses `createSourceFile`, node guards, `forEachChild`, and `getStart`.
It does not ask a type checker to resolve types or create a compiler project.

The current `discoverInFile(filePath, contents)` boundary already contains this
work. No parser service, factory or runtime-selection flag would simplify its
caller. Effect Platform remains responsible for reading files; parsing stays a
local operation. TypeScript is not used as a runtime loader.

## Published surface checked

Inspected the registry metadata and published `typescript@7.0.2` tarball,
including its exports, AST declarations, API options and root import.
The root export points to `lib/version.cjs`: `version` is `7.0.2`, while
`createSourceFile` and `isCallExpression` are undefined.

The package exposes `unstable/ast`, node guards, factories, scanners and
visitors, plus synchronous/asynchronous API clients. Its factory named
`createSourceFile` takes prebuilt statements, an EOF token, text and paths;
it is not the existing parse-text API. No equivalent public standalone
parse-text declaration was found. The API client instead manages snapshots
and projects, with a native child process or an existing pipe connection,
and explicit close/disposal obligations.

Some node operations remain recognizable, including `getStart` and node
`forEachChild`. That lowers AST visitor migration effort, but does not remove
the changed parser acquisition, resource lifetime or packaging requirements.
This is an export/declaration evaluation, not a successful native API migration
or a performance comparison.

## Sourcing decision

The existing TypeScript 6 parser already owns the required syntax and source
location semantics. Keep it rather than rebuilding parsing from scanners or
adding Babel, SWC, or another parser plus a second AST translation.

Microsoft's [TypeScript 7 announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)
says stable programmatic access is not available in 7.0 and recommends running
6.0 alongside the native compiler for API-dependent tools. It also identifies
`@typescript/typescript6` as a compatibility package. That package is an option
if dependency naming later requires an alias; the current `^6.0.3` constraint
already excludes 7, so no alias or manifest change is needed now.

Revisit this decision when a supported native API can replace the actual
parse-text call, or when discovery needs semantic project information. A
migration must compare declaration identities and exact spans on the existing
fixtures, verify packaged Node execution and binary deployment, and measure
end-to-end discovery. Compiler build speed alone is not evidence of parser
benefit.

Verification: all 59 PostgreSQL schema-management behavior tests passed with
the current parser, including alias/namespace/class discovery, wrapped
declarations, duplicate identity rejection and nested-declaration rejection.
