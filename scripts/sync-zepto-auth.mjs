#!/usr/bin/env node
/**
 * Push local Zepto OAuth files to Netlify Blobs (compari5-auth).
 * Zepto only whitelists localhost redirects — OTP locally, then sync here.
 */
import { spawnSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();
const DATA = join(ROOT, ".data");
const KEYS = [
  "oauth-zepto-tokens",
  "oauth-zepto-client",
  "oauth-zepto-discovery",
];

function jwtExp(token) {
  try {
    const parts = String(token).split(".");
    if (parts.length < 2) return null;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = "=".repeat((4 - (payload.length % 4)) % 4);
    const claims = JSON.parse(
      Buffer.from(payload + pad, "base64").toString("utf8")
    );
    return typeof claims.exp === "number" ? claims.exp : null;
  } catch {
    return null;
  }
}

const tokensPath = join(DATA, "oauth-zepto-tokens.json");
if (!existsSync(tokensPath)) {
  console.error("Missing .data/oauth-zepto-tokens.json — finish localhost OTP first.");
  process.exit(1);
}

const tokens = JSON.parse(readFileSync(tokensPath, "utf8"));
if (!tokens?.access_token || tokens.deleted) {
  console.error("Zepto tokens missing or deleted.");
  process.exit(1);
}

const exp = jwtExp(tokens.access_token);
if (exp != null && exp * 1000 <= Date.now() + 60_000) {
  console.error(
    `Zepto token expired (exp ${new Date(exp * 1000).toISOString()}). Re-run OTP on localhost.`
  );
  process.exit(1);
}

console.log(
  exp
    ? `Token OK — expires ${new Date(exp * 1000).toISOString()}`
    : "Token OK — no JWT exp claim"
);

for (const key of KEYS) {
  const file = join(DATA, `${key}.json`);
  if (!existsSync(file)) {
    console.warn(`skip missing ${key}`);
    continue;
  }
  console.log(`Uploading ${key}…`);
  const r = spawnSync(
    "npx",
    ["netlify", "blobs:set", "compari5-auth", key, "--input", file, "--force"],
    { cwd: ROOT, encoding: "utf8", stdio: "inherit" }
  );
  if (r.status !== 0) {
    console.error(`Failed to upload ${key}`);
    process.exit(r.status || 1);
  }
}

// Drop leftover authorize state from failed Netlify attempts
for (const key of [
  "oauth-zepto-pending",
  "oauth-zepto-verifier",
  "oauth-zepto-state",
]) {
  spawnSync(
    "npx",
    ["netlify", "blobs:delete", "compari5-auth", key, "--force"],
    { cwd: ROOT, encoding: "utf8", stdio: "ignore" }
  );
}

console.log("Synced Zepto auth to Netlify Blobs.");
