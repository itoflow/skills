// Builds the release files from the current commit.
// Usage: node scripts/package.mjs <output-dir>
//
// itoflow-<version>.tar.gz  One `itoflow/` folder that works as a local
//                           marketplace for Claude Code and Codex.
// itoflow-<version>-openai.zip  The plugin in Codex format, ready to submit
//                           to the ChatGPT and Codex plugin directory.
// In GitHub Actions it also writes step outputs.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const output = process.argv[2];
assert.ok(
  output && process.argv.length === 3,
  "Usage: node scripts/package.mjs <output-dir>",
);

const { name, version } = JSON.parse(
  readFileSync(join(root, ".claude-plugin/plugin.json"), "utf8"),
);
const outputDir = resolve(output);
mkdirSync(outputDir, { recursive: true });

const pluginPaths = [
  ".claude-plugin",
  ".codex-plugin",
  ".mcp.json",
  "plugin.json",
  "mcp.json",
  "gemini-extension.json",
  "assets",
  "skills",
];
const builds = {
  archive: {
    file: join(outputDir, `${name}-${version}.tar.gz`),
    args: ["--format=tar.gz", `--prefix=${name}/`],
    paths: [
      "README.md",
      "LICENSE",
      "SECURITY.md",
      "CONTRIBUTING.md",
      ".agents",
      ...pluginPaths,
    ],
  },
  openai: {
    file: join(outputDir, `${name}-${version}-openai.zip`),
    args: ["--format=zip"],
    // Codex format only: OpenAI reads plugin.json first when it is present.
    paths: [".codex-plugin", ".mcp.json", "assets", "skills"],
  },
};

const result = { name, version, tag: `${name}--v${version}` };
for (const [key, { file, args, paths }] of Object.entries(builds)) {
  assert.ok(!existsSync(file), `output already exists: ${file}`);
  execFileSync(
    "git",
    ["archive", ...args, `--output=${file}`, "HEAD", "--", ...paths],
    {
      cwd: root,
      stdio: "inherit",
    },
  );
  const checksum = createHash("sha256")
    .update(readFileSync(file))
    .digest("hex");
  writeFileSync(`${file}.sha256`, `${checksum}  ${basename(file)}\n`);
  result[key] = file;
}

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    Object.entries(result)
      .map(([key, value]) => `${key}=${value}\n`)
      .join(""),
  );
}
console.log(JSON.stringify(result));
