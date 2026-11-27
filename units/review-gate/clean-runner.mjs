#!/usr/bin/env node
/**
 * baton-audit-runner / units/review-gate
 * 双盲审计自动化运行器 (Clean Context Runner)
 * 杜绝 Agent 自测自评与粉饰测试断言，独立重跑真实验收测试
 * AEF / Lab Agent Engineering Toolkit
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT_ROOT = path.dirname(fileURLToPath(import.meta.url));
const REVIEW_GATE_VERSION = (() => {
  try {
    const vPath = path.join(SCRIPT_ROOT, 'VERSION.md');
    if (fs.existsSync(vPath)) {
      const content = fs.readFileSync(vPath, 'utf8');
      const m = content.match(/v?(\d+\.\d+\.\d+)/);
      if (m) return m[1];
    }
  } catch {}
  return '1.2.3';
})();

const args = process.argv.slice(2);
const command = args[0] || 'help';

function runCmd(cmd, options = {}) {
  try {
    return execSync(cmd, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      ...options,
    }).trim();
  } catch (err) {
    if (options.ignoreError) return null;
    const stderr = err.stderr ? err.stderr.toString() : '';
    throw new Error(`Command failed: ${cmd}\n${stderr || err.message}`);
  }
}

function getRepoRoot() {
  const root = runCmd('git rev-parse --show-toplevel', { ignoreError: true });
  return root ? path.resolve(root) : process.cwd();
}

function sanitizeId(id) {
  if (!id) return '';
  return String(id).trim().replace(/[^a-zA-Z0-9._-]/g, '-');
}

function readFM(content) {
  const m = content.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const fm = {};
  for (const line of m[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx !== -1) {
      const k = line.slice(0, idx).trim();
      let v = line.slice(idx + 1).trim();
      if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) {
        v = v.slice(1, -1);
      }
      fm[k] = v;
    }
  }
  return fm;
}

function findHandoffFile(repoRoot, ticketId) {
  const cleanId = sanitizeId(ticketId);
  const candidates = [
    path.join(repoRoot, '.handoffs', 'handoffs', `${cleanId}.md`),
    path.join(repoRoot, 'handoffs', `${cleanId}.md`),
    path.join(repoRoot, '.handoffs', 'receipts', `${cleanId}-resp.md`),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function extractCommandsFromTicket(content) {
  const commands = [];
  // 查找 ## 验收判据 或 ## Acceptance Criteria
  const sectionMatch = content.match(/##\s+(?:验收判据|Acceptance Criteria)[\s\S]*?(?=\n##\s+|$)/i);
  if (sectionMatch) {
    const sectionBody = sectionMatch[0];
    const codeBlockRegex = /```(?:bash|sh|zsh)?\n([\s\S]*?)```/g;
    let match;
    while ((match = codeBlockRegex.exec(sectionBody)) !== null) {
      const block = match[1].trim();
      if (block) {
        // 保持代码块作为一个完整的 Shell 脚本块执行，避免逐行拆分导致 cd、变量与上下文断裂
        commands.push(block);
      }
    }
  }
  return commands;
}

function resolveTestCommands(repoRoot, ticketFile, explicitCmd) {
  if (explicitCmd) return [explicitCmd];

  if (ticketFile && fs.existsSync(ticketFile)) {
    const content = fs.readFileSync(ticketFile, 'utf8');
    const cmds = extractCommandsFromTicket(content);
    if (cmds.length > 0) return cmds;
  }

  // 尝试从 .handoff-hub.json 读取
  const hubJsonPath = path.join(repoRoot, '.handoff-hub.json');
  if (fs.existsSync(hubJsonPath)) {
    try {
      const hub = JSON.parse(fs.readFileSync(hubJsonPath, 'utf8'));
      if (hub.test_command) return [hub.test_command];
      if (Array.isArray(hub.test_commands)) return hub.test_commands;
    } catch {}
  }

  // 尝试从 package.json 读取
  const pkgPath = path.join(repoRoot, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.scripts && pkg.scripts.test) {
        return ['npm test'];
      }
    } catch {}
  }

  return [];
}

function resolveExecutionDir(repoRoot, ticketId, explicitDir) {
  if (explicitDir) return path.resolve(explicitDir);
  const cleanId = sanitizeId(ticketId);
  const worktreeDir = path.join(repoRoot, '.worktrees', cleanId);
  if (fs.existsSync(worktreeDir)) {
    return worktreeDir;
  }
  return repoRoot;
}

function executeClean(cmd, cwd) {
  // 环境变量白名单清洗：剥离模型思维链等主观环境变量
  const safeEnv = {
    PATH: process.env.PATH || '',
    HOME: process.env.HOME || '',
    USER: process.env.USER || '',
    SHELL: process.env.SHELL || '/bin/sh',
    LANG: process.env.LANG || 'en_US.UTF-8',
    TMPDIR: process.env.TMPDIR || '/tmp',
    CI: 'true',
    AUDIT_RUNNER: '1',
  };

  const startTime = Date.now();
  const res = spawnSync(cmd, {
    shell: true,
    cwd,
    env: safeEnv,
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024,
  });
  const durationMs = Date.now() - startTime;

  return {
    cmd,
    exitCode: res.status !== null ? res.status : 1,
    stdout: res.stdout || '',
    stderr: res.stderr || '',
    durationMs,
  };
}

function runAudit(ticketId, options = {}) {
  const cleanId = sanitizeId(ticketId);
  if (!cleanId) {
    console.error('❌ 错误: 必须指定工单 ID (ticket-id)。');
    process.exit(1);
  }

  const repoRoot = getRepoRoot();
  const ticketFile = findHandoffFile(repoRoot, cleanId);
  const targetDir = resolveExecutionDir(repoRoot, cleanId, options.worktree);
  const isWorktree = targetDir !== repoRoot;

  let ticketFm = {};
  if (ticketFile) {
    ticketFm = readFM(fs.readFileSync(ticketFile, 'utf8')) || {};
  }

  const commands = resolveTestCommands(repoRoot, ticketFile, options.cmd);
  if (commands.length === 0) {
    console.error(`❌ 未找到工单 [${cleanId}] 的校验命令。请在工单中注明「## 验收判据」代码块，或指定 --cmd "<命令>"。`);
    process.exit(1);
  }

  if (!options.json) {
    console.log(`\n🛡️ [Clean Audit Runner] 启动无上下文双盲审计执行:`);
    console.log(`  • 工单 ID: \x1b[36m${cleanId}\x1b[0m`);
    console.log(`  • 执行物理目录: \x1b[32m${targetDir}\x1b[0m ${isWorktree ? '(隔离工作树)' : '(主代码库)'}`);
    console.log(`  • 待执行校验项 (${commands.length} 项):`);
    commands.forEach((c, idx) => console.log(`    ${idx + 1}. \x1b[33m${c}\x1b[0m`));
    console.log('─'.repeat(70));
  }

  const results = [];
  let allPassed = true;

  for (const cmd of commands) {
    if (!options.json) process.stdout.write(`⏳ 正在执行: ${cmd} ... `);
    const execRes = executeClean(cmd, targetDir);
    results.push(execRes);

    if (execRes.exitCode === 0) {
      if (!options.json) console.log(`\x1b[32mPASS\x1b[0m (${(execRes.durationMs / 1000).toFixed(2)}s)`);
    } else {
      if (!options.json) {
        console.log(`\x1b[31mFAIL (Exit ${execRes.exitCode})\x1b[0m (${(execRes.durationMs / 1000).toFixed(2)}s)`);
        console.error('\n' + '─'.repeat(40) + ' [错误输出摘要] ' + '─'.repeat(40));
        console.error(execRes.stderr.trim() || execRes.stdout.trim() || '(无标准输出)');
        console.error('─'.repeat(96) + '\n');
      }
      allPassed = false;
      break;
    }
  }

  // 提取最新 Commit SHA 与受改动文件列表
  let currentSha = runCmd('git rev-parse HEAD', { cwd: targetDir, ignoreError: true }) || 'unknown';
  let diffPaths = runCmd('git diff --name-only HEAD~1', { cwd: targetDir, ignoreError: true }) || '';
  if (!diffPaths) {
    diffPaths = runCmd('git status --porcelain', { cwd: targetDir, ignoreError: true }) || '';
    diffPaths = diffPaths
      .split('\n')
      .map((l) => l.slice(3).trim())
      .filter(Boolean)
      .join(',');
  }

  if (options.json) {
    console.log(JSON.stringify({ ticketId: cleanId, allPassed, targetDir, currentSha, results }, null, 2));
    if (!allPassed) process.exit(1);
    return;
  }

  console.log('─'.repeat(70));
  if (!allPassed) {
    console.error(`❌ [审计未通过] 双盲验收重跑失败，真实 Exit Code 非 0。硬性拦截！`);
    console.error(`   提示: 执行方提交的回执被判定为不合规，严禁采信。请执行: baton reject ${cleanId} -n "..." 进行退回。\n`);
    process.exit(1);
  }

  console.log(`✅ [双盲审计全部通过] 所有校验命令真实 Exit 0。工程诚实度已核实！`);

  // 生成符合 RESPONSE-TEMPLATE.md 的审计报告
  const auditReceiptDraft = `---
handoff_id: ${cleanId}
mode: ${ticketFm.mode || 'intra-repo'}
from_lane: ${ticketFm.to_lane || 'audit'}
to_lane: ${ticketFm.from_lane || 'impl'}
needs_change: false
evidence_paths: "${diffPaths || 'none'}"
evidence_commits: "${currentSha}"
date: ${new Date().toISOString().split('T')[0]}
---

# Receipt: ${cleanId}

## 结论 (Verdict)
Verified — 经 Clean Audit Runner 双盲独立重跑，所有验收命令物理 Exit 0 校验通过。

## 修复状态 (Status & Implementation)
- 审计物理环境: ${targetDir}
- 验证基准 Commit: ${currentSha}

## 验收证据 (Evidence & Verification)
- Commits: \`${currentSha}\`
- Modified Paths: \`${diffPaths || 'none'}\`
- Verification Commands Executed:
\`\`\`bash
${commands.join('\n')}
\`\`\`
- Result Output: All ${commands.length} test commands passed cleanly (Exit 0).
`;

  if (options.autoReceipt) {
    const receiptPath = path.join(repoRoot, '.handoffs', 'receipts', `${cleanId}-resp.md`);
    fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
    fs.writeFileSync(receiptPath, auditReceiptDraft, 'utf8');
    console.log(`\n📄 [自动化回执已生成] 标准审计回执已落盘至: \x1b[36m${receiptPath}\x1b[0m`);
    console.log(`   👉 请执行终态交付: baton deliver ${cleanId}`);
  } else {
    console.log(`\n📋 [推荐回执正文草稿 (可直接复制或加 --auto-receipt 自动登记)]:\n`);
    console.log(auditReceiptDraft);
  }
}

function showHelp() {
  console.log(`
Baton Audit Runner CLI — 双盲审计自动化运行器 (units/review-gate v${REVIEW_GATE_VERSION})

用法:
  baton-audit-runner run <ticket-id> [选项]
      在无上下文隔离环境下自动重跑工单的验收测试命令，直接校验物理 Exit Code。

选项:
  --cmd "<command>"        显式指定要执行的测试命令 (覆盖默认解析)
  --worktree <path>        显式指定物理执行目录 (默认自动探测 .worktrees/<id>)
  --auto-receipt           测试通过后自动生成并落盘符合规范的审计回执文件
  --json                   以 JSON 结构化格式输出测试结果与指标
  --help, -h               显示帮助信息

设计原则:
  • Hooks are Law: 只有真实子进程 Exit 0 算通过，杜绝 Agent 自行编造通过口令。
  • Clean Context: 清洗环境变量，剥离大模型主观思维链上下文干扰。
`);
}

// CLI 解析
const isJson = args.includes('--json');
const isAutoReceipt = args.includes('--auto-receipt');
const cmdIdx = args.indexOf('--cmd');
const explicitCmd = cmdIdx !== -1 ? args[cmdIdx + 1] : undefined;
const wtIdx = args.indexOf('--worktree');
const explicitWt = wtIdx !== -1 ? args[wtIdx + 1] : undefined;

switch (command) {
  case '--version':
  case '-v':
  case 'version':
    console.log(`baton-audit-runner CLI · v${REVIEW_GATE_VERSION} (units/review-gate)`);
    process.exit(0);
    break;
  case 'run':
  case 'check':
    runAudit(args[1], {
      cmd: explicitCmd,
      worktree: explicitWt,
      autoReceipt: isAutoReceipt,
      json: isJson,
    });
    break;
  case 'help':
  case '--help':
  case '-h':
  default:
    showHelp();
    break;
}
