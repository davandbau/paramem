import fs from "node:fs";
import path from "node:path";
import { repoPath } from "../core/paths.js";
import { err, info, ok } from "../core/logger.js";

function slug(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "note";
}

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", () => resolve(data));
  });
}

export async function runInbox(args) {
  const repo = repoPath();
  const inboxDir = path.join(repo, "inbox");
  if (!fs.existsSync(path.join(repo, ".git"))) {
    err(`not initialized: ${repo} (run 'paramem init' first)`);
    process.exit(1);
  }
  fs.mkdirSync(inboxDir, { recursive: true });

  let content;
  let source;

  if (args.length === 0) {
    err("usage: paramem inbox <text|file|->\nexamples:\n  paramem inbox 'a freeform note'\n  paramem inbox notes.md\n  echo '...' | paramem inbox -");
    process.exit(2);
  }

  const firstArg = args[0];
  // Treat firstArg as a file path only when the user is clearly pointing at one:
  // single arg AND it looks path-like (contains a separator or extension) AND exists.
  const looksLikePath =
    args.length === 1 &&
    firstArg !== "-" &&
    (firstArg.includes("/") || firstArg.startsWith("~") || /\.\w{1,8}$/.test(firstArg));

  if (firstArg === "-") {
    content = await readStdin();
    source = "stdin";
  } else if (looksLikePath && fs.existsSync(firstArg) && fs.statSync(firstArg).isFile()) {
    content = fs.readFileSync(firstArg, "utf8");
    source = path.basename(firstArg);
  } else {
    content = args.join(" ");
    source = "cli";
  }

  if (!content.trim()) {
    err("empty content; nothing to add");
    process.exit(2);
  }

  // Compact timestamp: YYYYMMDDTHHMMSS (seconds resolution). Collision-resistant
  // enough for manual dumps; the maintenance pass is idempotent either way.
  const ts = new Date().toISOString().replace(/[-:.]/g, "").replace(/Z$/, "").slice(0, 15);
  const baseSlug = source === "stdin" || source === "cli"
    ? slug(content.split("\n")[0] || "note")
    : slug(path.parse(source).name);
  const name = `${ts}-${baseSlug}.md`;
  const outPath = path.join(inboxDir, name);
  fs.writeFileSync(outPath, content.endsWith("\n") ? content : content + "\n");

  ok(`queued: ${path.relative(repo, outPath)}`);
  info("will be classified on the next maintenance pass (run 'paramem maintain --force' to classify now)");
}
