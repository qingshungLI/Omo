import { access, readFile, readdir } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const roots = ["AGENTS.md", "PLANS.md", "README.md", "docs", "plans"];

async function markdownFiles(path) {
  const absolute = resolve(root, path);
  try {
    const entries = await readdir(absolute, { withFileTypes: true });
    const nested = await Promise.all(
      entries.map((entry) => markdownFiles(join(path, entry.name)))
    );
    return nested.flat();
  } catch {
    return extname(path) === ".md" ? [absolute] : [];
  }
}

const files = (await Promise.all(roots.map(markdownFiles))).flat().sort();
const problems = [];
const fileByRepositoryPath = new Map(
  files.map((file) => [relative(root, file), file])
);
const graph = new Map(
  files.map((file) => [relative(root, file), new Set()])
);
let linkCount = 0;

for (const file of files) {
  const content = await readFile(file, "utf8");
  const source = relative(root, file);
  const links = content.matchAll(
    /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g
  );

  for (const match of links) {
    linkCount += 1;
    const rawTarget = match[1].trim();
    const target = extname(rawTarget) ? rawTarget : `${rawTarget}.md`;
    const targetPath = resolve(root, target);
    const relativeTarget = relative(root, targetPath);

    if (
      relativeTarget === ".." ||
      relativeTarget.startsWith(`..${sep}`) ||
      isAbsolute(relativeTarget)
    ) {
      problems.push(
        `${relative(root, file)}: link escapes repository: [[${rawTarget}]]`
      );
      continue;
    }

    try {
      await access(targetPath);
      const targetRepositoryPath = relative(root, targetPath);
      if (fileByRepositoryPath.has(targetRepositoryPath)) {
        graph.get(source).add(targetRepositoryPath);
      }
    } catch {
      problems.push(
        `${relative(root, file)}: missing target: [[${rawTarget}]]`
      );
    }
  }
}

const entrypoints = [
  "AGENTS.md",
  "README.md",
  "PLANS.md",
  "docs/index.md",
  "plans/README.md"
];
const reachable = new Set();
const queue = entrypoints.filter((path) => fileByRepositoryPath.has(path));

while (queue.length) {
  const current = queue.shift();
  if (reachable.has(current)) continue;
  reachable.add(current);
  for (const target of graph.get(current) || []) {
    if (!reachable.has(target)) queue.push(target);
  }
}

for (const path of fileByRepositoryPath.keys()) {
  if (path.startsWith("docs/") && !reachable.has(path)) {
    problems.push(`${path}: stable document is not reachable from the document graph`);
  }
}

const activePlanFiles = [...fileByRepositoryPath.keys()].filter(
  (path) => path.startsWith("plans/") && path !== "plans/README.md"
);
const plansIndex = await readFile(resolve(root, "PLANS.md"), "utf8");
const indexedPlans = [
  ...plansIndex.matchAll(/\[\[(plans\/[^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g)
]
  .map((match) => {
    const rawTarget = match[1].trim();
    return extname(rawTarget) ? rawTarget : `${rawTarget}.md`;
  })
  .filter((path) => path !== "plans/README.md");

for (const path of new Set(indexedPlans)) {
  const count = indexedPlans.filter((candidate) => candidate === path).length;
  if (count > 1) {
    problems.push(`PLANS.md: active plan is indexed ${count} times: [[${path}]]`);
  }
}

for (const path of activePlanFiles) {
  const count = indexedPlans.filter((candidate) => candidate === path).length;
  if (count !== 1) {
    problems.push(
      `${path}: active plan must appear exactly once in PLANS.md (found ${count})`
    );
  }
}

if (problems.length) {
  console.error(
    `Found ${problems.length} agent document graph problem(s):\n${problems.join("\n")}`
  );
  process.exitCode = 1;
} else {
  console.log(
    `Checked ${files.length} Markdown files and ${linkCount} wiki links: ` +
      "all targets resolve; no orphan docs or plan-index conflicts."
  );
}
