import fs from "node:fs";
import path from "node:path";
import { stateDir } from "../core/paths.js";

export function runPreCompact() {
  const file = path.join(stateDir(), "memory-audit.json");

  let turns = 0;
  try { const a = JSON.parse(fs.readFileSync(file, "utf8")); turns = a.turns || 0; } catch {}

  const payload = {
    hookSpecificOutput: {
      hookEventName: "PreCompact",
      additionalContext: [
        "URGENT MEMORY AUDIT — Context compaction is imminent. Information WILL be lost.\n\n",
        `Turns since last audit: ${turns}.\n\n`,
        "Review the ENTIRE conversation for:\n",
        "- Project decisions (architecture, pricing, business model, status changes)\n",
        "- User feedback or preferences (how to work, what to avoid, what worked)\n",
        "- Non-obvious patterns or lessons learned\n",
        "- References to external systems or resources\n",
        "- Decisions made in discussion that never produced a commit\n\n",
        `After writing memories, reset the audit timer:\n`,
        `echo '{"last_audit_ts":'\\'$(date +%s)\\'',\"turns\":0}' > ${file}\n\n`,
        "This is a HARD DEADLINE. Context will be lost after this turn. Do NOT skip.",
      ].join(""),
    },
  };
  process.stdout.write(JSON.stringify(payload) + "\n");
}
