import { readFile, stat } from "node:fs/promises";

const bundlePath = new URL("../main.js", import.meta.url);
const bundle = await readFile(bundlePath, "utf8");
const bundleStats = await stat(bundlePath);
const maxBundleBytes = 512 * 1_024;

const banned = [
  ["Node fs", /require\(["'](?:node:)?fs(?:\/promises)?["']\)/u],
  ["Node path", /require\(["'](?:node:)?path["']\)/u],
  ["Node child_process", /require\(["'](?:node:)?child_process["']\)/u],
  ["Electron", /require\(["']electron["']\)/u],
  ["Axios", /\baxios\b/iu],
  ["direct fetch", /\bfetch\s*\(/u],
];

const violations = banned.filter(([, pattern]) => pattern.test(bundle)).map(([label]) => label);

if (!bundle.includes('require("obsidian")') && !bundle.includes("require('obsidian')")) {
  violations.push("Obsidian must remain an external dependency");
}
if (bundleStats.size > maxBundleBytes) {
  violations.push(`bundle exceeds ${String(maxBundleBytes)} bytes`);
}

if (violations.length > 0) {
  throw new Error(`Mobile bundle audit failed: ${violations.join(", ")}`);
}

process.stdout.write(`Mobile bundle audit passed (${String(bundleStats.size)} bytes).\n`);
