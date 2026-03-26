import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

type Snippet = {
  readonly startLine: number;
  readonly endLine: number;
  readonly code: string;
};

type Group = {
  readonly snippets: Array<Snippet>;
};

const root = process.cwd();
const readmePath = path.join(root, "README.md");
const outDir = path.join(root, "test/public/types/readme-generated");

const readme = await Bun.file(readmePath).text();
const lines = readme.split("\n");

const snippets: Array<Snippet> = [];

let currentLang: string | null = null;
let currentStartLine = 0;
let currentBuffer: Array<string> = [];

for (let index = 0; index < lines.length; index++) {
  const lineNumber = index + 1;
  const line = lines[index]!;
  if (line.startsWith("```")) {
    if (currentLang === null) {
      currentLang = line.slice(3).trim();
      currentStartLine = lineNumber;
      currentBuffer = [];
      continue;
    }
    if (currentLang === "ts") {
      snippets.push({
        startLine: currentStartLine,
        endLine: lineNumber,
        code: currentBuffer.join("\n"),
      });
    }
    currentLang = null;
    currentStartLine = 0;
    currentBuffer = [];
    continue;
  }
  if (currentLang !== null) {
    currentBuffer.push(line);
  }
}

const groups: Array<Group> = [];

for (const snippet of snippets) {
  const firstNonBlankLine =
    snippet.code.split("\n").find((line) => line.trim().length > 0) ?? "";
  if (
    groups.length === 0 ||
    firstNonBlankLine.startsWith("import ")
  ) {
    groups.push({ snippets: [snippet] });
    continue;
  }
  groups[groups.length - 1]!.snippets.push(snippet);
}

await rm(outDir, { force: true, recursive: true });
await mkdir(outDir, { recursive: true });

const rangeLabelOf = (group: Group): string =>
  group.snippets
    .map((snippet) => `${snippet.startLine}-${snippet.endLine}`)
    .join(", ");

const indent = (code: string): string =>
  code
    .split("\n")
    .map((line) => (line.length === 0 ? line : `  ${line}`))
    .join("\n");

for (let index = 0; index < groups.length; index++) {
  const group = groups[index]!;
  const firstSnippet = group.snippets[0]!;
  const lastSnippet = group.snippets[group.snippets.length - 1]!;
  const filename = `${String(index + 1).padStart(2, "0")}-${firstSnippet.startLine}-${lastSnippet.endLine}.ts`;
  const [rootSnippet, ...continuations] = group.snippets;
  const contents = [
    "// Generated from README.md.",
    "// Do not edit directly; update README.md and rerun `bun run generate:readme-types`.",
    `// Code fences: ${rangeLabelOf(group)}`,
    "",
    `// README.md:${rootSnippet!.startLine}-${rootSnippet!.endLine}`,
    rootSnippet!.code,
    ...continuations.flatMap((snippet) => [
      "",
      "{",
      `  // README.md:${snippet.startLine}-${snippet.endLine}`,
      indent(snippet.code),
      "}",
    ]),
    "",
    "export {};",
    "",
  ].join("\n");
  await Bun.write(path.join(outDir, filename), contents);
}

console.log(`Generated ${groups.length} README type test group(s) in ${path.relative(root, outDir)}`);
