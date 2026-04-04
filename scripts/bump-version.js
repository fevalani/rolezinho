#!/usr/bin/env node
// Bump version before deploy.
// Usage: node scripts/bump-version.js [patch|minor|major]  (default: patch)
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// ── 1. Bump package.json version ─────────────────────────────────────────────
const pkgPath = resolve(root, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));

const [major, minor, patch] = pkg.version.split(".").map(Number);
const part = process.argv[2] ?? "patch";
let newVersion;
if (part === "major") newVersion = `${major + 1}.0.0`;
else if (part === "minor") newVersion = `${major}.${minor + 1}.0`;
else newVersion = `${major}.${minor}.${patch + 1}`;

pkg.version = newVersion;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
console.log(`package.json  ${pkg.version.replace(newVersion, "")}→ ${newVersion}`);

// ── 2. Update android/app/build.gradle ───────────────────────────────────────
const gradlePath = resolve(root, "android/app/build.gradle");
if (existsSync(gradlePath)) {
  let gradle = readFileSync(gradlePath, "utf8");

  // Increment versionCode by 1
  gradle = gradle.replace(/versionCode\s+(\d+)/, (_, n) => {
    const next = Number(n) + 1;
    console.log(`build.gradle  versionCode ${n} → ${next}`);
    return `versionCode ${next}`;
  });

  // Set versionName to match package.json
  gradle = gradle.replace(/versionName\s+"[^"]+"/, () => {
    console.log(`build.gradle  versionName → "${newVersion}"`);
    return `versionName "${newVersion}"`;
  });

  writeFileSync(gradlePath, gradle);
}

// ── 3. Write .env.production ──────────────────────────────────────────────────
const envPath = resolve(root, ".env.production");
let envContent = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";

if (/^VITE_APP_VERSION=.*/m.test(envContent)) {
  envContent = envContent.replace(/^VITE_APP_VERSION=.*/m, `VITE_APP_VERSION=${newVersion}`);
} else {
  envContent += (envContent.endsWith("\n") || envContent === "" ? "" : "\n") + `VITE_APP_VERSION=${newVersion}\n`;
}

writeFileSync(envPath, envContent);
console.log(`.env.production  VITE_APP_VERSION=${newVersion}`);
