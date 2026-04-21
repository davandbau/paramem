import os from "node:os";
import { loadConfig } from "../core/config.js";
import { git, hasStaged } from "../core/git.js";
import { acquire, release } from "../core/lock.js";
import { repoPath } from "../core/paths.js";
import { ok, warn, info, err, heading } from "../core/logger.js";

const HOSTNAME = os.hostname().split(".")[0];

export async function runSync() {
  heading("paramem sync");
  const cfg = loadConfig(repoPath());
  const acquired = await acquire({ waitMs: 20_000 });
  if (!acquired) { err("lock busy; try again in a moment"); process.exit(1); }
  try {
    info("fetching");
    git(["fetch", "origin"]);
    info("rebasing");
    const pull = git(["pull", "--rebase", "--autostash", "origin", cfg.branch]);
    if (pull.code !== 0) warn(`pull: ${pull.stderr.split("\n")[0]}`);
    git(["add", "-A"]);
    if (!hasStaged()) {
      const push = git(["push", "origin", cfg.branch]);
      if (push.code === 0) ok("pushed pending commits");
      else ok("nothing to commit, working tree clean");
      return;
    }
    const ts = new Date().toISOString().replace(/\.\d+Z$/, "Z");
    const msg = `chore: memory sync ${ts} [${HOSTNAME}]`;
    const commit = git(["commit", "-m", msg]);
    if (commit.code !== 0) { err(`commit failed: ${commit.stderr}`); return; }
    const push = git(["push", "origin", cfg.branch]);
    if (push.code !== 0) { err(`push failed: ${push.stderr}`); return; }
    ok(`pushed: ${msg}`);
  } finally {
    release();
  }
}
