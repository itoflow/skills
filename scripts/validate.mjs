// Checks the plugin manifests, marketplaces and skills in this repository.
// Run with `node scripts/validate.mjs [dir]`. Needs Node 20 or later and no packages.
import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

const root = resolve(process.argv[2] ?? join(import.meta.dirname, ".."));
const name = "itoflow";
const serverUrl = "https://mcp.itoflow.ai/mcp";

// Every URL in a published file must point at one of these hosts.
const publicHosts = new Set([
  "itoflow.ai",
  "app.itoflow.ai",
  "docs.itoflow.ai",
  "mcp.itoflow.ai",
  "github.com",
  "agent-plugins.org",
  "agentskills.io",
  "modelcontextprotocol.io",
  "code.claude.com",
  "support.claude.com",
  "claude.ai",
  "developers.openai.com",
  "chatgpt.com",
  "geminicli.com",
  "skills.sh",
  "www.apache.org",
  "www.w3.org",
]);
const publicGitHubOwners = new Set([
  "itoflow",
  "agentplugins",
  "vercel-labs",
  "google-gemini",
]);

const secretPatterns = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key"],
  [/\bbearer\s+[a-z0-9._~+/-]{16,}/i, "bearer token"],
  [/\b(?:sk|pk|rk)_(?:live|test)_[a-z0-9]{8,}/i, "API key"],
  [/\bsk-[a-z0-9_-]{20,}/i, "API key"],
  [/\bAKIA[0-9A-Z]{16}\b/, "AWS access key"],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}\b/, "GitHub token"],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}/, "Slack token"],
  [/\b(?:localhost|127\.0\.0\.1)(?::\d+)?\b/, "local address"],
];

const failures = [];
function check(condition, message) {
  if (!condition) failures.push(message);
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(join(root, path), "utf8"));
  } catch (error) {
    failures.push(
      `${path}: ${error.code === "ENOENT" ? "missing" : error.message}`,
    );
    return {};
  }
}

// A checkout lists its files through git; an export or archive is walked.
function publishedFiles() {
  if (existsSync(join(root, ".git"))) {
    return execFileSync(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard"],
      {
        cwd: root,
        encoding: "utf8",
      },
    )
      .split("\n")
      .filter(Boolean);
  }
  const walk = (dir) =>
    readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
      const path = dir ? `${dir}/${entry.name}` : entry.name;
      if (entry.name === "node_modules") return [];
      return entry.isDirectory() ? walk(path) : [path];
    });
  return walk("");
}

function frontmatter(text, path) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  check(match, `${path}: missing YAML frontmatter`);
  if (!match) return {};
  return Object.fromEntries(
    match[1]
      .split("\n")
      .map((line) => line.match(/^([a-z-]+):\s*(.*)$/))
      .filter(Boolean)
      .map(([, key, value]) => [key, value.trim()]),
  );
}

// Marketplaces: one plugin, at the repository root.
const claudeMarket = readJson(".claude-plugin/marketplace.json");
const codexMarket = readJson(".agents/plugins/marketplace.json");
check(
  claudeMarket.name === name && codexMarket.name === name,
  `marketplaces must be named ${name}`,
);
check(
  claudeMarket.owner?.name === "Itoflow",
  "Claude marketplace owner must be Itoflow",
);
check(
  claudeMarket.plugins?.length === 1 &&
    claudeMarket.plugins[0].name === name &&
    claudeMarket.plugins[0].source === "./",
  `Claude marketplace must list ${name} at ./`,
);
const codexEntry = codexMarket.plugins?.[0];
check(
  codexMarket.plugins?.length === 1 &&
    codexEntry.name === name &&
    codexEntry.source?.source === "local" &&
    codexEntry.source?.path === "./",
  `Codex marketplace must list ${name} at ./`,
);
check(
  codexEntry?.policy?.authentication === "ON_INSTALL",
  "Codex sign-in must run on install",
);

// Manifests: every client sees the same plugin.
const claude = readJson(".claude-plugin/plugin.json");
const codex = readJson(".codex-plugin/plugin.json");
const agent = readJson("plugin.json");
const gemini = readJson("gemini-extension.json");
const manifests = {
  Claude: claude,
  Codex: codex,
  "Agent Plugins": agent,
  Gemini: gemini,
};

// develop publishes prereleases such as 0.3.0-develop.h1a2b3c4d5.
check(
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?$/.test(claude.version ?? ""),
  "version must be semver",
);
for (const [client, manifest] of Object.entries(manifests)) {
  check(manifest.name === name, `${client} manifest name must be ${name}`);
  check(
    manifest.version === claude.version,
    `${client} version differs from Claude's`,
  );
  check(
    manifest.description === claude.description,
    `${client} description differs from Claude's`,
  );
}
check(
  claudeMarket.plugins?.[0]?.description === claude.description,
  "marketplace description differs",
);
for (const key of ["homepage", "repository", "license"]) {
  check(
    codex[key] === claude[key] && agent[key] === claude[key],
    `${key} differs between manifests`,
  );
}
check(
  claude.skills === "./skills/" && codex.skills === "./skills/",
  "skills must load from ./skills/",
);
check(
  claude.mcpServers === "./.mcp.json" && codex.mcpServers === "./.mcp.json",
  "MCP servers must load from ./.mcp.json",
);

const agentFields = [
  "$schema",
  "name",
  "version",
  "description",
  "author",
  "homepage",
  "repository",
  "license",
  "keywords",
  "extensions",
];
// Codex 0.160 rejects Agent Plugins 1.1.0, so stay on 1.0.0 until it accepts it.
check(
  agent.$schema ===
    "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "plugin.json must target Agent Plugins 1.0.0",
);
check(
  Object.keys(agent).every((key) => agentFields.includes(key)),
  "plugin.json has a field Agent Plugins does not allow",
);
check(
  !agent.extensions?.["com.openai"],
  "plugin.json must not override the Codex manifest",
);

// Codex and ChatGPT listing limits.
const listing = codex.interface ?? {};
check(
  listing.displayName?.length <= 30,
  "Codex displayName must be 30 characters or fewer",
);
check(
  listing.shortDescription?.length <= 30,
  "Codex shortDescription must be 30 characters or fewer",
);
check(
  listing.longDescription?.length <= 4000,
  "Codex longDescription must be 4000 characters or fewer",
);
for (const key of [
  "developerName",
  "category",
  "websiteURL",
  "supportURL",
  "privacyPolicyURL",
  "termsOfServiceURL",
]) {
  check(listing[key], `Codex interface.${key} is required`);
}
for (const key of ["logo", "composerIcon"]) {
  check(
    listing[key] && existsSync(join(root, listing[key])),
    `Codex interface.${key} must name a file`,
  );
}
check(
  (listing.defaultPrompt ?? []).length <= 3,
  "Codex allows at most three default prompts",
);
for (const prompt of listing.defaultPrompt ?? [])
  check(prompt.length <= 128, "default prompt over 128 characters");
check(!existsSync(join(root, ".app.json")), ".app.json is not used");

// MCP: one server, the same URL in every format.
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
check(
  same(readJson(".mcp.json"), {
    mcpServers: { itoflow: { type: "http", url: serverUrl } },
  }),
  `.mcp.json must declare only ${serverUrl}`,
);
check(
  same(readJson("mcp.json"), {
    $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
    mcpServers: { itoflow: { type: "streamable-http", url: serverUrl } },
  }),
  `mcp.json must declare only ${serverUrl}`,
);
check(
  same(gemini.mcpServers, { itoflow: { httpUrl: serverUrl } }),
  `gemini-extension.json must declare only ${serverUrl}`,
);

// Skills
const skillDirs = readdirSync(join(root, "skills"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);
for (const skill of skillDirs) {
  const path = `skills/${skill}/SKILL.md`;
  if (!existsSync(join(root, path))) {
    failures.push(`${path}: missing`);
    continue;
  }
  const meta = frontmatter(readFileSync(join(root, path), "utf8"), path);
  check(meta.name === skill, `${path}: name must match its folder`);
  check(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(meta.name ?? ""),
    `${path}: name must be kebab-case`,
  );
  check(
    meta.description && meta.description.length <= 1024,
    `${path}: description must be 1-1024 characters`,
  );
}

// Every published file
for (const path of publishedFiles()) {
  const full = join(root, path);
  if (lstatSync(full).isSymbolicLink()) {
    failures.push(`${path}: symlinks must not be published`);
    continue;
  }
  if (!statSync(full).isFile() || path === "scripts/validate.mjs") continue;
  check(
    !/(^|\/)\.env(\.|$)/.test(path),
    `${path}: environment files must not be published`,
  );
  const text = readFileSync(full, "utf8");

  for (const [pattern, label] of secretPatterns) {
    check(!pattern.test(text), `${path}: looks like it contains a ${label}`);
  }
  for (const [, host] of text.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) {
    check(
      publicHosts.has(host.toLowerCase()),
      `${path}: URL host ${host} is not on the public list`,
    );
  }
  for (const [, owner] of text.matchAll(/github\.com\/([A-Za-z0-9_.-]+)/g)) {
    check(
      publicGitHubOwners.has(owner),
      `${path}: GitHub link to ${owner} is not on the public list`,
    );
  }
  if (path.endsWith(".md")) {
    for (const [, target] of text.matchAll(
      /\]\((?!https?:|mailto:|#)([^)#\s]+)/g,
    )) {
      check(
        existsSync(resolve(dirname(full), target)),
        `${path}: broken link to ${target}`,
      );
    }
  }
}

if (failures.length) {
  console.error(failures.map((failure) => `✗ ${failure}`).join("\n"));
  process.exit(1);
}
console.log(`✓ ${name} ${claude.version} passed`);
