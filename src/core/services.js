import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  HOME,
  launchAgentsDir,
  repoPath,
  systemdUserDir,
  templatesDir,
} from "./paths.js";

const LABELS = {
  watchdog: "com.claude-code-memory.watchdog",
  puller: "com.claude-code-memory.puller",
};

const MAINTAIN_LABEL = "com.claude-code-memory.maintain";

function render(tplPath, substitutions) {
  let content = fs.readFileSync(tplPath, "utf8");
  for (const [k, v] of Object.entries(substitutions)) {
    content = content.replaceAll(`{{${k}}}`, v);
  }
  return content;
}

function nodeBin() {
  return process.execPath;
}

export function platform() {
  return os.platform();
}

export function install({ ccmBin, intervalSeconds }) {
  const os_ = platform();
  if (os_ === "darwin") return installLaunchd({ ccmBin, intervalSeconds });
  if (os_ === "linux") return installSystemd({ ccmBin, intervalSeconds });
  throw new Error(`unsupported platform: ${os_}. supported: macOS (darwin), Linux.`);
}

export function uninstall() {
  const os_ = platform();
  if (os_ === "darwin") return uninstallLaunchd();
  if (os_ === "linux") return uninstallSystemd();
  return false;
}

function installLaunchd({ ccmBin, intervalSeconds }) {
  const dir = launchAgentsDir();
  fs.mkdirSync(dir, { recursive: true });
  const substitutions = {
    HOME,
    REPO: repoPath(),
    NODE: nodeBin(),
    CCM_BIN: ccmBin,
    INTERVAL: String(intervalSeconds),
    PATH: "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin",
  };
  const watchdogPlist = path.join(dir, `${LABELS.watchdog}.plist`);
  const pullerPlist = path.join(dir, `${LABELS.puller}.plist`);
  fs.writeFileSync(
    watchdogPlist,
    render(path.join(templatesDir(), "launchd-watchdog.plist"), {
      ...substitutions,
      LABEL: LABELS.watchdog,
    })
  );
  fs.writeFileSync(
    pullerPlist,
    render(path.join(templatesDir(), "launchd-puller.plist"), {
      ...substitutions,
      LABEL: LABELS.puller,
    })
  );
  for (const f of [watchdogPlist, pullerPlist]) {
    spawnSync("launchctl", ["unload", f], { stdio: "ignore" });
    const r = spawnSync("launchctl", ["load", f], { stdio: "inherit" });
    if (r.status !== 0) throw new Error(`launchctl load failed for ${f}`);
  }
  return true;
}

function uninstallLaunchd() {
  const dir = launchAgentsDir();
  let removed = false;
  for (const label of Object.values(LABELS)) {
    const f = path.join(dir, `${label}.plist`);
    if (fs.existsSync(f)) {
      spawnSync("launchctl", ["unload", f], { stdio: "ignore" });
      fs.unlinkSync(f);
      removed = true;
    }
  }
  return removed;
}

function installSystemd({ ccmBin, intervalSeconds }) {
  const dir = systemdUserDir();
  fs.mkdirSync(dir, { recursive: true });
  const substitutions = {
    HOME,
    REPO: repoPath(),
    NODE: nodeBin(),
    CCM_BIN: ccmBin,
    INTERVAL: String(intervalSeconds),
  };
  const files = [
    ["claude-code-memory-watchdog.service", "systemd-watchdog.service"],
    ["claude-code-memory-pull.service", "systemd-pull.service"],
    ["claude-code-memory-pull.timer", "systemd-pull.timer"],
  ];
  for (const [dest, tpl] of files) {
    fs.writeFileSync(
      path.join(dir, dest),
      render(path.join(templatesDir(), tpl), substitutions)
    );
  }
  runSystemctl(["daemon-reload"]);
  runSystemctl([
    "enable",
    "--now",
    "claude-code-memory-watchdog.service",
    "claude-code-memory-pull.timer",
  ]);
  return true;
}

function uninstallSystemd() {
  runSystemctl(
    ["disable", "--now", "claude-code-memory-watchdog.service", "claude-code-memory-pull.timer"],
    { ignoreFailure: true }
  );
  const dir = systemdUserDir();
  let removed = false;
  for (const f of [
    "claude-code-memory-watchdog.service",
    "claude-code-memory-pull.service",
    "claude-code-memory-pull.timer",
  ]) {
    const p = path.join(dir, f);
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
      removed = true;
    }
  }
  runSystemctl(["daemon-reload"], { ignoreFailure: true });
  return removed;
}

function runSystemctl(args, { ignoreFailure = false } = {}) {
  const r = spawnSync("systemctl", ["--user", ...args], { stdio: "inherit" });
  if (!ignoreFailure && r.status !== 0) {
    throw new Error(`systemctl --user ${args.join(" ")} failed`);
  }
}

export function installMaintenanceTimer({ ccmBin, hour, minute }) {
  const os_ = platform();
  if (os_ === "darwin") {
    const dir = launchAgentsDir();
    fs.mkdirSync(dir, { recursive: true });
    const substitutions = {
      HOME,
      REPO: repoPath(),
      NODE: process.execPath,
      CCM_BIN: ccmBin,
      LABEL: MAINTAIN_LABEL,
      HOUR: String(hour),
      MINUTE: String(minute),
      PATH: "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin",
    };
    const dst = path.join(dir, `${MAINTAIN_LABEL}.plist`);
    fs.writeFileSync(
      dst,
      render(path.join(templatesDir(), "launchd-maintain.plist"), substitutions)
    );
    spawnSync("launchctl", ["unload", dst], { stdio: "ignore" });
    spawnSync("launchctl", ["load", dst], { stdio: "inherit" });
    return true;
  }
  if (os_ === "linux") {
    const dir = systemdUserDir();
    fs.mkdirSync(dir, { recursive: true });
    const substitutions = {
      HOME,
      REPO: repoPath(),
      NODE: process.execPath,
      CCM_BIN: ccmBin,
      HOUR: String(hour).padStart(2, "0"),
      MINUTE: String(minute).padStart(2, "0"),
    };
    fs.writeFileSync(
      path.join(dir, "claude-code-memory-maintain.service"),
      render(path.join(templatesDir(), "systemd-maintain.service"), substitutions)
    );
    fs.writeFileSync(
      path.join(dir, "claude-code-memory-maintain.timer"),
      render(path.join(templatesDir(), "systemd-maintain.timer"), substitutions)
    );
    runSystemctl(["daemon-reload"]);
    runSystemctl(["enable", "--now", "claude-code-memory-maintain.timer"]);
    return true;
  }
  throw new Error(`unsupported platform: ${os_}`);
}

export function uninstallMaintenanceTimer() {
  const os_ = platform();
  if (os_ === "darwin") {
    const f = path.join(launchAgentsDir(), `${MAINTAIN_LABEL}.plist`);
    if (fs.existsSync(f)) {
      spawnSync("launchctl", ["unload", f], { stdio: "ignore" });
      fs.unlinkSync(f);
      return true;
    }
    return false;
  }
  if (os_ === "linux") {
    runSystemctl(["disable", "--now", "claude-code-memory-maintain.timer"], { ignoreFailure: true });
    let removed = false;
    for (const f of [
      "claude-code-memory-maintain.service",
      "claude-code-memory-maintain.timer",
    ]) {
      const p = path.join(systemdUserDir(), f);
      if (fs.existsSync(p)) {
        fs.unlinkSync(p);
        removed = true;
      }
    }
    runSystemctl(["daemon-reload"], { ignoreFailure: true });
    return removed;
  }
  return false;
}

export function serviceStatus() {
  const os_ = platform();
  if (os_ === "darwin") {
    const r = spawnSync("launchctl", ["list"], { encoding: "utf8" });
    const labels = [...Object.values(LABELS), MAINTAIN_LABEL];
    const lines = (r.stdout || "").split("\n").filter((l) =>
      labels.some((label) => l.includes(label))
    );
    return lines.length ? lines.join("\n") : "not loaded";
  }
  if (os_ === "linux") {
    const r = spawnSync(
      "systemctl",
      ["--user", "is-active",
        "claude-code-memory-watchdog.service",
        "claude-code-memory-pull.timer",
        "claude-code-memory-maintain.timer"],
      { encoding: "utf8" }
    );
    return (r.stdout || "").trim();
  }
  return "unknown";
}
