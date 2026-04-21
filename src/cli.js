#!/usr/bin/env node
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { runInit } from "./commands/init.js";
import { runUninstall } from "./commands/uninstall.js";
import { runStatus } from "./commands/status.js";
import { runSync } from "./commands/sync.js";
import { runPull } from "./commands/pull.js";
import { runMaintain } from "./commands/maintain.js";
import { runInbox } from "./commands/inbox.js";
import { runWatchdog } from "./core/watchdog.js";
import { runSessionStart } from "./hooks/session-start.js";
import { runPromptSubmit } from "./hooks/prompt-submit.js";
import { resolveBin } from "./core/settings.js";
import { err } from "./core/logger.js";

const VERSION = (() => {
  try {
    const pkgPath = fileURLToPath(new URL("../package.json", import.meta.url));
    return JSON.parse(fs.readFileSync(pkgPath, "utf8")).version;
  } catch {
    return "0.0.0";
  }
})();

function usage() {
  process.stdout.write(`paramem v${VERSION}

Persistent, git-synced PARA memory for Claude Code.

Usage:
  paramem init [remote-url] [--empty] [--path <dir>]
      Clone or create a memory repo, install services, wire hooks.

  paramem status
      Show repo SHA, service state, hook registration, recent logs.

  paramem sync
      Force one pull+commit+push cycle.

  paramem maintain [--dry-run] [--force] [--install] [--uninstall]
      Run one autonomous maintenance pass (uses claude -p + MAX subscription).
      --install schedules a daily timer; --uninstall removes it.

  paramem inbox <text|file|->
      Queue freeform content for the next maintenance pass to classify.

  paramem uninstall
      Stop services and remove hooks. Memory repo is left intact.

Internal (invoked by services/hooks):
  paramem watch            Run the file-system watchdog loop.
  paramem pull             Run a single git pull with lock.
  paramem hook <event>     Emit JSON for a Claude Code hook.
                           Events: session-start, prompt-submit

Environment:
  PARAMEM_REPO             Override repo path (default: ~/.claude/memory).
  PARAMEM_BIN              Override the bin path used in generated hooks/services.

More: https://github.com/davandbau/paramem
`);
}

const [, , cmd, ...rest] = process.argv;

try {
  switch (cmd) {
    case "init":
      await runInit(rest);
      break;
    case "uninstall":
      runUninstall();
      break;
    case "status":
      runStatus();
      break;
    case "sync":
      await runSync();
      break;
    case "maintain":
      await runMaintain(rest);
      break;
    case "inbox":
      await runInbox(rest);
      break;
    case "pull":
      runPull();
      break;
    case "watch":
      runWatchdog();
      break;
    case "hook": {
      const sub = rest[0];
      if (sub === "session-start") runSessionStart(resolveBin());
      else if (sub === "prompt-submit") runPromptSubmit(resolveBin());
      else { err(`unknown hook event: ${sub}`); process.exit(2); }
      break;
    }
    case "--version":
    case "-v":
    case "version":
      process.stdout.write(`paramem v${VERSION}\n`);
      break;
    case "--help":
    case "-h":
    case undefined:
      usage();
      break;
    default:
      err(`unknown command: ${cmd}`);
      usage();
      process.exit(2);
  }
} catch (e) {
  err(e.message || String(e));
  process.exit(1);
}
