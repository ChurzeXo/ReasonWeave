#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

// 在 POSIX 平台（macOS / Linux）为 CLI 脚本与模板自适应赋予执行权限（chmod +x）
// Windows 平台跳过（不依赖 POSIX 权限位），彻底根除 Windows cmd.exe 下 chmod 与 true 不可识别导致的安装中断
if (process.platform !== 'win32') {
  const targets = [
    'bin/lab.mjs',
    'units/handoffs/handoff.mjs',
    'units/worktree/worktree.mjs',
    'units/review-gate/clean-runner.mjs',
    'units/orphan/bin/lab-orphan.mjs',
    'units/spec-guard/bin/spec-guard.mjs',
    'units/skills/skills.mjs',
    'units/skills/bin/task-brief.mjs',
    'units/skills/bin/review-package.mjs',
    'units/adr/scripts/adr-init.sh',
    'units/preflight/templates/preflight.sh',
    'units/preflight/templates/check.sh',
    'units/review-gate/templates/scan.sh',
    'scripts/sync-all-consumers.mjs',
    'scripts/postinstall.mjs',
  ];

  for (const rel of targets) {
    const fullPath = path.join(repoRoot, rel);
    try {
      if (fs.existsSync(fullPath)) {
        const stat = fs.statSync(fullPath);
        fs.chmodSync(fullPath, stat.mode | 0o111);
      }
    } catch {}
  }
}
process.exit(0);
