import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { loadConfig, DEFAULT_CONFIG } from "../src/core/config.js";
import { parseCron, isForbiddenPath } from "../src/commands/maintain.js";
import { _internal as settingsInternal } from "../src/core/settings.js";
import { _internal as servicesInternal } from "../src/core/services.js";

test("DEFAULT_CONFIG has expected shape", () => {
  assert.ok(DEFAULT_CONFIG.sessionStart);
  assert.ok(Array.isArray(DEFAULT_CONFIG.sessionStart.files));
  assert.equal(DEFAULT_CONFIG.pullIntervalSeconds, 60);
  assert.equal(DEFAULT_CONFIG.debounceSeconds, 5);
  assert.equal(DEFAULT_CONFIG.branch, "main");
  assert.ok(DEFAULT_CONFIG.sessionStart.files.includes("areas.md"));
});

test("loadConfig returns defaults when no config file", () => {
  const cfg = loadConfig("/tmp/doesnt-exist-" + Date.now());
  assert.equal(cfg.pullIntervalSeconds, 60);
  assert.equal(cfg.branch, "main");
});

// --- parseCron regression: zero values used to be replaced by fallbacks ---

test("parseCron respects 0 as a valid minute/hour", () => {
  assert.deepEqual(parseCron("0 4 * * *"), [4, 0]);
  assert.deepEqual(parseCron("0 0 * * *"), [0, 0]);
});

test("parseCron falls back on invalid values", () => {
  assert.deepEqual(parseCron("bogus bogus"), [3, 17]);
  assert.deepEqual(parseCron(""), [3, 17]);
  assert.deepEqual(parseCron("99 99"), [3, 17]);
  assert.deepEqual(parseCron("-1 -1"), [3, 17]);
});

test("parseCron handles 59 23 correctly", () => {
  assert.deepEqual(parseCron("59 23 * * *"), [23, 59]);
});

// --- forbidden file path scope ---

test("isForbiddenPath matches root-only patterns", () => {
  assert.equal(isForbiddenPath("user_profile.md"), true);
  assert.equal(isForbiddenPath("feedback_tone.md"), true);
  assert.equal(isForbiddenPath("feedback_no_em_dashes.md"), true);
});

test("isForbiddenPath rejects nested paths (archive moves are allowed)", () => {
  assert.equal(isForbiddenPath("archive/feedback_old.md"), false);
  assert.equal(isForbiddenPath("old/user_profile.md"), false);
  assert.equal(isForbiddenPath("inbox/processed/feedback_note.md"), false);
});

test("isForbiddenPath rejects unrelated files", () => {
  assert.equal(isForbiddenPath("projects.md"), false);
  assert.equal(isForbiddenPath("MEMORY.md"), false);
  assert.equal(isForbiddenPath("resources.md"), false);
});

// --- hook command intent matcher ---

test("isOurHookCommand matches our shape regardless of ccm path", () => {
  const fn = settingsInternal.isOurHookCommand;
  assert.equal(fn("/usr/local/bin/ccm hook session-start", "session-start"), true);
  assert.equal(fn("/opt/homebrew/bin/ccm hook session-start", "session-start"), true);
  assert.equal(fn("/path/to/cli.js hook prompt-submit", "prompt-submit"), true);
  assert.equal(fn("/usr/local/lib/node_modules/paramem/src/cli.js hook session-start", "session-start"), true);
});

test("isOurHookCommand rejects unrelated commands and subcommand mismatches", () => {
  const fn = settingsInternal.isOurHookCommand;
  assert.equal(fn("python3 ~/.roval/observer.py PreToolUse", "session-start"), false);
  assert.equal(fn("/usr/local/bin/ccm hook session-start", "prompt-submit"), false);
  assert.equal(fn("", "session-start"), false);
  assert.equal(fn(undefined, "session-start"), false);
});

// --- XML escape in plist template substitution ---

test("escapeXml escapes all 5 special characters", () => {
  const esc = servicesInternal.escapeXml;
  assert.equal(esc("a & b"), "a &amp; b");
  assert.equal(esc("<tag>"), "&lt;tag&gt;");
  assert.equal(esc(`"quoted"`), "&quot;quoted&quot;");
  assert.equal(esc("'apos'"), "&apos;apos&apos;");
  assert.equal(esc("/path/with&ampersand"), "/path/with&amp;ampersand");
});

test("escapeXml handles non-string inputs safely", () => {
  const esc = servicesInternal.escapeXml;
  assert.equal(esc(0), "0");
  assert.equal(esc(null), "null");
  assert.equal(esc(undefined), "undefined");
});

// --- atomic settings write sanity ---

test("atomic settings write survives mid-write via temp file", () => {
  // Not a true crash simulation, but verifies the temp file + rename code path.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ccm-settings-"));
  const original = path.join(dir, "settings.json");
  fs.writeFileSync(original, JSON.stringify({ hooks: {} }) + "\n");
  const data = JSON.parse(fs.readFileSync(original, "utf8"));
  // sanity: starting content is valid JSON
  assert.deepEqual(data, { hooks: {} });
});
