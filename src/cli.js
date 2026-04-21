#!/usr/bin/env node
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
import { resolveCcmBin } from "./core/settings.js";
import { err } from "./core/logger.js";

const VERSION = "0.2.0";

function usage() {
  process.stdout.write(`claude-code-memory v${VERSION}

Persistent, git-synced memory for Claude Code.

Usage:
  ccm init [remote-url] [--empty] [--path <dir>]
      Clone or create a memory repo, install services, wire hooks.

  ccm status
      Show repo SHA, service state, hook registration, recent logs.

  ccm sync
      Force one pull+commit+push cycle.

  ccm maintain [--dry-run] [--force] [--install] [--uninstall]
      Run one autonomous maintenance pass (uses claude -p + MAX subscription).
      --install schedules a daily timer; --uninstall removes it.

  ccm inbox <text|file|->
      Queue freeform content for the next maintenance pass to classify.

  ccm uninstall
      Stop services and remove hooks. Memory repo is left intact.

Internal (invoked by services/hooks):
  ccm watch                Run the file-system watchdog loop.
  ccm pull                 Run a single git pull with lock.
  ccm hook <event>         Emit JSON for a Claude Code hook.
                           Events: session-start, prompt-submit

Environment:
  MEMORY_REPO              Override repo path (default: ~/.claude/memory).

More: https://github.com/davandbau/claude-code-memory
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
      if (sub === "session-start") runSessionStart(resolveCcmBin());
      else if (sub === "prompt-submit") runPromptSubmit(resolveCcmBin());
      else { err(`unknown hook event: ${sub}`); process.exit(2); }
      break;
    }
    case "--version":
    case "-v":
    case "version":
      process.stdout.write(`claude-code-memory v${VERSION}\n`);
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
