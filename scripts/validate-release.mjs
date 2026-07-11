import { readFile, stat } from "node:fs/promises";

const SEMVER = /^\d+\.\d+\.\d+$/;
const REQUIRED_ASSETS = ["main.js", "manifest.json", "styles.css"];

const manifest = await readJson("manifest.json");
const packageJson = await readJson("package.json");
const versions = await readJson("versions.json");
const tag = argumentValue("--tag");

assertString(manifest.id, "manifest.id");
assertString(manifest.name, "manifest.name");
assertString(manifest.description, "manifest.description");
assertString(manifest.author, "manifest.author");
assertSemver(manifest.version, "manifest.version");
assertSemver(manifest.minAppVersion, "manifest.minAppVersion");
assert(manifest.isDesktopOnly === false, "manifest.isDesktopOnly must be false");
assert(packageJson.version === manifest.version, "package.json version must match manifest.json");
assert(
  versions[manifest.version] === manifest.minAppVersion,
  "versions.json current version must match manifest.minAppVersion",
);

for (const [version, minAppVersion] of Object.entries(versions)) {
  assertSemver(version, `versions.json key ${version}`);
  assertSemver(minAppVersion, `versions.json value for ${version}`);
}

if (tag !== undefined) {
  assertSemver(tag, "release tag");
  assert(tag === manifest.version, "release tag must exactly match manifest.version (without v)");
}

if (process.argv.includes("--assets")) {
  for (const asset of REQUIRED_ASSETS) {
    const file = await stat(asset);
    assert(file.isFile() && file.size > 0, `${asset} must exist and be non-empty`);
  }
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read valid ${path}`, { cause: error });
  }
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  assert(value !== undefined && !value.startsWith("--"), `${name} requires a value`);
  return value;
}

function assertSemver(value, label) {
  assert(typeof value === "string" && SEMVER.test(value), `${label} must use x.y.z format`);
}

function assertString(value, label) {
  assert(typeof value === "string" && value.trim() !== "", `${label} must be a non-empty string`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
