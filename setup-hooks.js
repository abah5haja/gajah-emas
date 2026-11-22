// Aktifkan hook repo (.githooks) otomatis, idempoten.
// Dipanggil oleh npm start / npm run dev agar clone baru langsung siap pakai.
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function git(args) {
  return execFileSync("git", args, { stdio: ["ignore", "pipe", "ignore"] })
    .toString()
    .trim();
}

try {
  let root;
  try {
    root = git(["rev-parse", "--show-toplevel"]);
  } catch {
    process.exit(0); // bukan repo git (mis. hasil unduhan ZIP)
  }

  const hook = path.join(root, ".githooks", "post-commit");
  if (!fs.existsSync(hook)) process.exit(0);

  let configured = "";
  try {
    configured = git(["config", "--local", "--get", "core.hooksPath"]);
  } catch {
    // belum disetel
  }

  if (!configured) {
    try {
      execFileSync("git", ["config", "--local", "core.hooksPath", ".githooks"], {
        stdio: "ignore",
      });
      console.log("Hook auto-push diaktifkan (core.hooksPath=.githooks)");
    } catch (error) {
      console.warn(`Gagal mengaktifkan hook auto-push: ${error.message}`);
    }
  }

  try {
    fs.chmodSync(hook, 0o755);
  } catch {
    // Windows tidak memakai bit executable
  }
} catch (error) {
  console.warn(`setup-hooks dilewati: ${error.message}`);
}
