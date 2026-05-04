import fs from "node:fs";
import path from "node:path";
import { stateDir } from "../core/paths.js";
import { loadConfig } from "../core/config.js";

const DEFAULTS = { turnThreshold: 20, timeThresholdSeconds: 21600 }; // 6 hours

export function runStop() {
  const state = stateDir();
  fs.mkdirSync(state, { recursive: true });
  const file = path.join(state, "memory-audit.json");

  let audit = { last_audit_ts: Math.floor(Date.now() / 1000), turns: 0 };
  try { audit = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}

  const now = Math.floor(Date.now() / 1000);
  const elapsed = now - (audit.last_audit_ts || 0);
  audit.turns = (audit.turns || 0) + 1;

  const cfg = loadConfig();
  const turnThreshold = cfg.memoryAudit?.turnThreshold ?? DEFAULTS.turnThreshold;
  const timeThreshold = cfg.memoryAudit?.timeThresholdSeconds ?? DEFAULTS.timeThresholdSeconds;

  if (audit.turns >= turnThreshold || elapsed >= timeThreshold) {
    const payload = {
      hookSpecificOutput: {
        hookEventName: "Stop",
        additionalContext: [
          "MEMORY AUDIT DUE — This is a mandatory, non-skippable checkpoint.\n",
          `Turns since last audit: ${audit.turns}. Time elapsed: ${Math.round(elapsed / 60)} minutes.\n\n`,
          "Review the conversation since the last audit. Write memories for any:\n",
          "- Project decisions (architecture, pricing, business model, status changes)\n",
          "- User feedback or preferences (how to work, what to avoid, what worked)\n",
          "- Non-obvious patterns or lessons learned\n",
          "- References to external systems or resources\n",
          "- Decisions made in discussion that never produced a commit\n\n",
          "After writing memories, reset the audit timer by running:\n",
          `echo '{"last_audit_ts":'\\'$(date +%s)\\'',\"turns\":0}' > ${file}\n\n`,
          "Do NOT skip this. Do NOT say \"nothing to save\" without actually reviewing.",
        ].join(""),
      },
    };
    process.stdout.write(JSON.stringify(payload) + "\n");
    // Don't reset here — Claude resets after completing the audit
  } else {
    // Just bump the counter
    fs.writeFileSync(file, JSON.stringify(audit));
  }
}
