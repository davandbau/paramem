import { spawnSync } from "node:child_process";

export function claudeInstalled() {
  const r = spawnSync("sh", ["-c", "command -v claude"], { encoding: "utf8" });
  return r.status === 0 && r.stdout.trim().length > 0;
}

/**
 * Run `claude -p` headlessly. Returns { code, stdout, stderr }.
 * Blocks until completion or timeout.
 *
 * The Claude CLI uses the user's OAuth session (Claude Code MAX). No API key needed.
 */
export function runClaudePrompt({
  prompt,
  cwd,
  addDirs = [],
  timeoutMs = 600_000,
  model = null,
  permissionMode = "acceptEdits",
  maxTurns = 80,
  onLog = null,
}) {
  const args = [
    "-p",
    "--permission-mode", permissionMode,
    "--max-turns", String(maxTurns),
  ];
  for (const d of addDirs) {
    args.push("--add-dir", d);
  }
  if (model) {
    args.push("--model", model);
  }
  // Prompt comes last as a positional arg.
  args.push(prompt);

  const r = spawnSync("claude", args, {
    cwd,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 50 * 1024 * 1024,
    env: process.env,
  });

  if (onLog) {
    if (r.stdout) onLog("stdout", r.stdout);
    if (r.stderr) onLog("stderr", r.stderr);
  }

  return {
    code: r.status ?? -1,
    stdout: r.stdout || "",
    stderr: r.stderr || "",
    timedOut: r.error?.code === "ETIMEDOUT" || r.signal === "SIGTERM",
  };
}
