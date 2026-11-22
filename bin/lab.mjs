#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execSync, execFileSync } from 'node:child_process';

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UNITS_DIR = path.join(PKG_ROOT, 'units');
const TEMPLATES_DIR = path.join(UNITS_DIR, 'playbook', 'templates');

const LAB_VERSION = (() => {
  try {
    const pkgPath = path.join(PKG_ROOT, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const data = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (data.version) return data.version;
    }
  } catch {}
  return '1.3.0';
})();

const args = process.argv.slice(2);
const command = args[0] || 'help';

function showHelp() {
  console.log(`
ReasonWeave CLI · v${LAB_VERSION} (AEF v1.0 · alias: lab, rw)

用法:
  reasonweave / lab / rw --version 打印当前版本
  lab init [name]             一键初始化完整 AEF 工程规范（交接/门禁/孤儿治理/ADR/待办/全客户端桩）
  lab list                    列出所有可用工程能力 Unit
  lab path [unit]             获取某个 Unit (或 lab 根目录) 的安装绝对路径
  lab doctor                  自检本地环境（node, git, opengrep 等前置依赖）
  lab sync-consumers [dir]    全自动批量同步并刷新所有下游消费方 (接入桩/配置/合规体检)
  lab baton [cmd]             调用工作流跨仓/仓内交接中枢 (别名: lab handoff)
  lab worktree [cmd]          Agent 物理工作树隔离调度 (别名: lab baton-worktree)
  lab audit-runner [cmd]      双盲审计自动化运行器 (别名: lab review-gate)
  lab orphan [cmd]            运行死代码与孤儿资产清道夫 (别名: lab lab-orphan)
  lab spec-guard [cmd]        架构规约与漂移守卫 CLI (别名: lab drift-gate)
  lab adr [cmd]               初始化项目架构决策记录 (别名: lab adr-init)
  lab preflight [cmd]         运行项目提交前置不变量探针
  lab migrate [dir]           将老项目中的硬编码路径 (~/Documents/lab/...) 一键迁移为动态规范
  lab zspec init [name]       按 ZSpec 工业标准为新项目一键初始化架构骨架与规范文档
  lab zspec add-unit <name>   为新项目新增一个自治工程端 (Unit: 如 web, ios, backend)
  lab zspec guide             查看面向 AI Agent 的 ZSpec 实战操作规范指南
  lab help                    显示帮助信息

全局命令 CLI:
  handoff / baton             调用工作流跨仓/仓内交接中枢
  baton-worktree              管理多 Agent 物理隔离工作树
  baton-audit-runner          双盲审计独立进程自动重跑器
  lab-orphan                  死代码与孤儿资产清道夫 CLI
  adr-init                    初始化项目架构决策记录 (ADR)
  spec-guard / drift-gate     架构规约与漂移守卫 CLI
`);
}

function listUnits() {
  console.log('\n📦 可用工程单元 (Units):');
  const units = [
    { name: 'handoffs', desc: '跨仓/仓内工作流交接中枢与 CLI 引擎' },
    { name: 'preflight', desc: '仓库不变量探针与提交门禁' },
    { name: 'review-gate', desc: 'SAST 静态扫描 (OpenGrep) 与代码评审防线' },
    { name: 'adr', desc: '架构决策记录机制 (light/standard/frozen)' },
    { name: 'spec-guard', desc: '架构规约与漂移守卫单元 (P3\' Invariant ↔ Assertion ↔ Code 对账)' },
    { name: 'backlog', desc: '待办捕获制度 (一任务一文件)' },
    { name: 'worktree', desc: '基于 Git Worktree 的物理目录隔离调度引擎' },
    { name: 'orphan', desc: '全局死代码与孤儿资产清道夫公共单元 (Core + Adapters)' },
    { name: 'playbook', desc: 'Agent Engineering Framework (AEF) 完整方法论' },
  ];
  for (const u of units) {
    console.log(`  - \x1b[36m${u.name.padEnd(14)}\x1b[0m ${u.desc}`);
  }
  console.log(`\n使用 "lab path <unit>" 查看对应物理路径。\n`);
}

function getPath(unitName) {
  if (!unitName) {
    console.log(PKG_ROOT);
    return;
  }
  const aliases = {
    'drift-gate': 'spec-guard',
  };
  const resolved = aliases[unitName] || unitName;
  const target = path.join(UNITS_DIR, resolved);
  if (fs.existsSync(target)) {
    console.log(target);
  } else {
    // 检查根目录下是否有软链接
    const rootSymlink = path.join(PKG_ROOT, unitName);
    if (fs.existsSync(rootSymlink)) {
      console.log(fs.realpathSync(rootSymlink));
    } else {
      console.error(`错误: 未找到 Unit "${unitName}"。`);
      process.exit(1);
    }
  }
}

function doctor() {
  console.log(`\n🔍 正在检查环境依赖 (ReasonWeave v${LAB_VERSION}):\n`);

  const userHome = os.homedir();
  const extraPaths = [
    path.dirname(process.execPath),
    path.join(userHome, '.local', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
  ].filter(p => fs.existsSync(p));

  const envPath = process.env.PATH || '';
  const augmentedPath = [
    ...new Set([
      ...envPath.split(':').filter(Boolean),
      ...extraPaths,
    ])
  ].join(':');

  const runCmd = (cmd, env = {}) => {
    return execSync(cmd, {
      stdio: ['pipe', 'pipe', 'ignore'],
      env: { ...process.env, PATH: augmentedPath, ...env },
      timeout: 10000,
    }).toString().trim();
  };

  // 1. Node.js (>=18)
  try {
    const nodeVer = process.version;
    const major = parseInt(nodeVer.replace(/^v/, '').split('.')[0], 10);
    if (major >= 18) {
      console.log(`  ✅ \x1b[32m${'Node.js (>=18)'.padEnd(28)}\x1b[0m: ${nodeVer} (${process.execPath})`);
    } else {
      console.log(`  ❌ \x1b[31m${'Node.js (>=18)'.padEnd(28)}\x1b[0m: 当前版本 ${nodeVer} 低于要求的 18.0.0 (必需)`);
    }
  } catch (err) {
    console.log(`  ❌ \x1b[31m${'Node.js (>=18)'.padEnd(28)}\x1b[0m: 检查失败 (${err.message})`);
  }

  // 2. Git
  try {
    const gitOut = runCmd('git --version');
    console.log(`  ✅ \x1b[32m${'Git'.padEnd(28)}\x1b[0m: ${gitOut}`);
  } catch {
    console.log(`  ❌ \x1b[31m${'Git'.padEnd(28)}\x1b[0m: 未安装或不在 PATH 中 (必需)`);
  }

  // 3. OpenGrep (review-gate L1)
  try {
    let ogBin = process.env.OPENGREP_BIN;
    if (!ogBin || !fs.existsSync(ogBin)) {
      try {
        const whichOut = runCmd('which opengrep');
        if (whichOut && fs.existsSync(whichOut)) ogBin = whichOut;
      } catch {}
    }
    const searchDirs = [
      path.join(userHome, '.local', 'bin'),
      '/opt/homebrew/bin',
      '/usr/local/bin',
    ];
    if (!ogBin) {
      for (const d of searchDirs) {
        const cand = path.join(d, 'opengrep');
        if (fs.existsSync(cand)) {
          ogBin = cand;
          break;
        }
      }
    }
    // Fallback to semgrep
    let isSemgrepFallback = false;
    if (!ogBin) {
      try {
        const whichSemgrep = runCmd('which semgrep');
        if (whichSemgrep && fs.existsSync(whichSemgrep)) {
          ogBin = whichSemgrep;
          isSemgrepFallback = true;
        }
      } catch {}
      if (!ogBin) {
        for (const d of searchDirs) {
          const cand = path.join(d, 'semgrep');
          if (fs.existsSync(cand)) {
            ogBin = cand;
            isSemgrepFallback = true;
            break;
          }
        }
      }
    }

    if (ogBin && fs.existsSync(ogBin)) {
      let verOut = '';
      try {
        verOut = execSync(`"${ogBin}" --version --disable-version-check`, {
          stdio: ['pipe', 'pipe', 'ignore'],
          env: { ...process.env, PATH: augmentedPath, OPENGREP_SEND_METRICS: 'off', SEMGREP_SEND_METRICS: 'off' },
          timeout: 15000,
        }).toString().trim();
      } catch {
        verOut = '已就绪 (探针超时)';
      }
      const inOriginalPath = (process.env.PATH || '').split(':').some(p => ogBin.startsWith(p + '/'));
      const note = inOriginalPath ? '' : ` (位于 ${ogBin}，非默认 PATH)`;
      const label = isSemgrepFallback ? 'Semgrep (review-gate 兼容)' : 'OpenGrep (review-gate L1)';
      console.log(`  ✅ \x1b[32m${label.padEnd(28)}\x1b[0m: ${verOut}${note}`);
    } else {
      console.log(`  ⚠️  \x1b[33m${'OpenGrep (review-gate L1)'.padEnd(28)}\x1b[0m: 未安装 (可选，仅 review-gate 扫描需要)`);
    }
  } catch (err) {
    console.log(`  ⚠️  \x1b[33m${'OpenGrep (review-gate L1)'.padEnd(28)}\x1b[0m: 检测异常 (${err.message})`);
  }

  // 4. Python 3 (review-gate L2 fallback & test tooling)
  try {
    const pyOut = runCmd('python3 --version');
    console.log(`  ✅ \x1b[32m${'Python 3 (L2 fallback)'.padEnd(28)}\x1b[0m: ${pyOut}`);
  } catch {
    console.log(`  ⚠️  \x1b[33m${'Python 3 (L2 fallback)'.padEnd(28)}\x1b[0m: 未检测到 python3 (可选)`);
  }

  // 5. 核心 Unit CLI 完备性检查
  console.log('\n  [Toolkit 内部 CLI 完备性]');
  const internalCli = [
    { name: 'baton (handoffs)', path: path.join(UNITS_DIR, 'handoffs', 'handoff.mjs'), verArg: '--version' },
    { name: 'lab-orphan (orphan)', path: path.join(UNITS_DIR, 'orphan', 'bin', 'lab-orphan.mjs'), verArg: '--version' },
    { name: 'spec-guard (spec-guard)', path: path.join(UNITS_DIR, 'spec-guard', 'bin', 'spec-guard.mjs'), verArg: '--version' },
    { name: 'baton-worktree (worktree)', path: path.join(UNITS_DIR, 'worktree', 'worktree.mjs'), verArg: '--help' },
    { name: 'review-gate scan.sh', path: path.join(UNITS_DIR, 'review-gate', 'templates', 'scan.sh') },
  ];
  for (const item of internalCli) {
    if (!fs.existsSync(item.path)) {
      console.log(`  ❌ \x1b[31m${item.name.padEnd(28)}\x1b[0m: 文件缺失 (${item.path})`);
      continue;
    }
    if (item.verArg) {
      try {
        const out = execSync(`node "${item.path}" ${item.verArg}`, {
          stdio: ['pipe', 'pipe', 'ignore'],
          timeout: 5000,
        }).toString().trim().split('\n')[0];
        console.log(`  ✅ \x1b[32m${item.name.padEnd(28)}\x1b[0m: ${out}`);
      } catch {
        console.log(`  ✅ \x1b[32m${item.name.padEnd(28)}\x1b[0m: 就绪 (${item.path})`);
      }
    } else {
      console.log(`  ✅ \x1b[32m${item.name.padEnd(28)}\x1b[0m: 就绪 (${item.path})`);
    }
  }
  console.log();
}

function migrate(targetDir, isDryRun) {
  const root = path.resolve(process.cwd(), targetDir || '.');
  console.log(`\n🚀 开始扫描并迁移目录: ${root} ${isDryRun ? '(预览模式 --dry-run)' : ''}`);

  const ignoreDirs = new Set(['.git', 'node_modules', 'dist', 'build', '.workbuddy', '.idea', '.vscode']);
  const filesToScan = [];

  function walk(dir) {
    const list = fs.readdirSync(dir);
    for (const item of list) {
      if (ignoreDirs.has(item)) continue;
      const fullPath = path.join(dir, item);
      const stat = fs.lstatSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (stat.isFile()) {
        filesToScan.push(fullPath);
      }
    }
  }

  walk(root);

  let totalReplaced = 0;
  let fileCount = 0;

  const userHome = os.homedir();
  const labPathRegexStr = `(?:~/|\\$HOME/|${userHome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/)Documents/lab`;

  const rules = [
    // 规则 0: 接入桩命令形态自相矛盾语义专门平滑修复
    {
      reg: /先用全路径\s+`node\s+[^`]+`\s*兜底，再跑一次\s+`node\s+[^`]+\s*link`\s*自愈。?/g,
      repl: '运行 `handoff link` 自愈（或通过 reasonweave 重新 `npm link`）。',
    },
    {
      reg: /先用全路径\s+`handoff\s+<op>`\s*兜底，再跑一次\s+`handoff\s+link`\s*自愈。?/g,
      repl: '运行 `handoff link` 自愈（或通过 reasonweave 重新 `npm link`）。',
    },
    {
      reg: new RegExp(`node\\s+${labPathRegexStr}/handoffs/handoff\\.mjs`, 'g'),
      repl: 'handoff',
    },
    {
      reg: new RegExp(`(?:bash\\s+)?${labPathRegexStr}/adr/scripts/adr-init\\.sh`, 'g'),
      repl: 'adr-init',
    },
    {
      reg: new RegExp(`${labPathRegexStr}/(handoffs|playbook|preflight|review-gate|adr|backlog)`, 'g'),
      repl: '$(lab path $1)',
    },
    {
      reg: new RegExp(`${labPathRegexStr}`, 'g'),
      repl: '$(lab path)',
    },
  ];

  for (const file of filesToScan) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      let updated = content;
      let fileMatchCount = 0;

      for (const rule of rules) {
        const matches = updated.match(rule.reg);
        if (matches) {
          fileMatchCount += matches.length;
          updated = updated.replace(rule.reg, rule.repl);
        }
      }

      if (fileMatchCount > 0) {
        const rel = path.relative(root, file);
        console.log(`  📝 [${fileMatchCount} 处匹配] ${rel}`);
        totalReplaced += fileMatchCount;
        fileCount++;
        if (!isDryRun) {
          fs.writeFileSync(file, updated, 'utf8');
        }
      }
    } catch {
      // 忽略无法读取的文件
    }
  }

  console.log(`\n✨ 迁移${isDryRun ? '预览' : '完成'}! 共扫描 ${filesToScan.length} 个文件，命中 ${fileCount} 个文件，处理 ${totalReplaced} 处路径。`);
  if (isDryRun) {
    console.log(`如需真正写入，请运行: lab migrate ${targetDir || '.'}\n`);
  } else {
    console.log(`请运行 git diff 确认改动并执行门禁验证。\n`);
  }
}

// ── AEF 全套工程规范一键初始化 (All-in-One Init) ──────────────────────────
function initProject(projectName, extraArgs = []) {
  const name = projectName || path.basename(process.cwd());
  const cwd = process.cwd();

  console.log(`\n🚀 \x1b[1;36m[Lab AEF v1.0]\x1b[0m 正在一键初始化全套工程规范: \x1b[32m${name}\x1b[0m\n`);

  // 1. 基础目录骨架
  const dirs = [
    'group/product',
    'group/architecture',
    'group/contracts',
    'units',
    'specs',
    'docs/backlogs',
    'docs/adr/templates',
    'docs/templates',
    'scripts',
    '.githooks/pre-commit.d',
    '.handoffs/handoffs',
    '.handoffs/receipts',
    '.handoffs/archive',
  ];

  for (const d of dirs) {
    fs.mkdirSync(path.join(cwd, d), { recursive: true });
  }

  // 1.1 仓内交接配置 (Baton Hub Configuration)
  const hubConfigDest = path.join(cwd, '.handoffs', '.handoff-hub.json');
  if (!fs.existsSync(hubConfigDest)) {
    const hubConfig = {
      mode: 'intra-repo',
      project: name,
      lanes: ['impl', 'audit', 'arch'],
      types: ['task', 'bug', 'feature'],
      workspace_default: 'same',
      close_policy: 'sender'
    };
    fs.writeFileSync(hubConfigDest, JSON.stringify(hubConfig, null, 2) + '\n', 'utf8');
    console.log('  ✅ 已创建: .handoffs/.handoff-hub.json (仓内工作流交接配置)');
  }

  // 2. 核心事实源与宪法 (ZSpec / AEF)
  const constSrc = path.join(TEMPLATES_DIR, 'constitution.md');
  const constContent = fs.existsSync(constSrc)
    ? fs.readFileSync(constSrc, 'utf8').replace(/<PROJECT>/g, name).replace(/<项目名>/g, name)
    : `# ${name} Constitution\n\nVersion: 1.0\n`;
  const constDest = path.join(cwd, 'constitution.md');
  if (!fs.existsSync(constDest)) {
    fs.writeFileSync(constDest, constContent, 'utf8');
    console.log('  ✅ 已创建: constitution.md (最高宪法 · 单一事实源)');
  }

  const intentSrc = path.join(TEMPLATES_DIR, 'group', 'product', 'intent.md');
  const intentContent = fs.existsSync(intentSrc)
    ? fs.readFileSync(intentSrc, 'utf8').replace(/<项目名>/g, name)
    : `# ${name} 产品意图\n\n## 核心问题\n\n## 关键用户旅程\n`;
  const intentDest = path.join(cwd, 'group', 'product', 'intent.md');
  if (!fs.existsSync(intentDest)) {
    fs.writeFileSync(intentDest, intentContent, 'utf8');
    console.log('  ✅ 已创建: group/product/intent.md (共享产品意图)');
  }

  const depSrc = path.join(TEMPLATES_DIR, 'group', 'architecture', 'dependency-graph.md');
  const depContent = fs.existsSync(depSrc)
    ? fs.readFileSync(depSrc, 'utf8').replace(/<项目名>/g, name)
    : `# ${name} 架构与依赖拓扑\n\n## Units 清单\n`;
  const depDest = path.join(cwd, 'group', 'architecture', 'dependency-graph.md');
  if (!fs.existsSync(depDest)) {
    fs.writeFileSync(depDest, depContent, 'utf8');
    console.log('  ✅ 已创建: group/architecture/dependency-graph.md (共享拓扑依赖)');
  }

  const apiSrc = path.join(TEMPLATES_DIR, 'group', 'contracts', 'api.md');
  const apiContent = fs.existsSync(apiSrc)
    ? fs.readFileSync(apiSrc, 'utf8').replace(/<项目名>/g, name)
    : `# ${name} 共享 API 契约\n`;
  const apiDest = path.join(cwd, 'group', 'contracts', 'api.md');
  if (!fs.existsSync(apiDest)) {
    fs.writeFileSync(apiDest, apiContent, 'utf8');
    console.log('  ✅ 已创建: group/contracts/api.md (共享接口契约)');
  }

  // 3. ADR (架构决策记录 · 纯 Node 生成，跨平台免 bash 依赖)
  const adrIndexDest = path.join(cwd, 'docs', 'adr', 'INDEX.md');
  const todayYMD = new Date().toISOString().slice(0, 10);
  if (!fs.existsSync(adrIndexDest)) {
    const adrIndexContent = `# ADR INDEX

> 采用 AEF ADR 规范（单一事实源）。只有 Accepted / 🔒 Frozen 的条目才注入 Agent 上下文。

| ADR | 标题 | 状态 | 日期 | 范围 | 文件 |
|---|---|---|---|---|---|
| 0001 | ${name} 基础架构与工程纪律初始化 | Accepted | ${todayYMD} | group | \`0001-${name}-bootstrap.md\` |

## 状态说明
- **Proposed** — 已起草，等待评审。
- **Accepted / 🔒 Frozen** — 生效。Frozen 不可直接改动，变更走 Supersedes。
- **Rejected** — 废弃留档。
`;
    fs.writeFileSync(adrIndexDest, adrIndexContent, 'utf8');
    console.log('  ✅ 已创建: docs/adr/INDEX.md (架构决策索引)');
  }

  const adrTplSrc = path.join(UNITS_DIR, 'adr', 'templates', 'adr-standard.md');
  const adrTplDest = path.join(cwd, 'docs', 'adr', 'templates', 'adr-template.md');
  if (fs.existsSync(adrTplSrc) && !fs.existsSync(adrTplDest)) {
    fs.copyFileSync(adrTplSrc, adrTplDest);
  }

  const adr0001Dest = path.join(cwd, 'docs', 'adr', `0001-${name}-bootstrap.md`);
  if (!fs.existsSync(adr0001Dest)) {
    const rawTpl = fs.existsSync(adrTplSrc) ? fs.readFileSync(adrTplSrc, 'utf8') : '';
    const bootstrapContent = rawTpl
      ? rawTpl.replace(/^#\s+ADR-NNNN:.*$/m, `# ADR-0001: ${name} 基础架构与工程纪律初始化`)
      : `# ADR-0001: ${name} 基础架构与工程纪律初始化\n\n## Status\nAccepted\n\n## Context\n初始化项目架构与 AEF 工程规范。\n`;
    fs.writeFileSync(adr0001Dest, bootstrapContent, 'utf8');
    console.log(`  ✅ 已创建: docs/adr/0001-${name}-bootstrap.md (初始架构决策)`);
  }

  // 4. Backlog (待办捕获跟踪)
  const backlogRulesSrc = path.join(UNITS_DIR, 'backlog', 'templates', 'project-ironrules.md');
  const backlogRulesDest = path.join(cwd, 'docs', 'backlogs', 'IRONRULES.md');
  if (fs.existsSync(backlogRulesSrc) && !fs.existsSync(backlogRulesDest)) {
    const rawRules = fs.readFileSync(backlogRulesSrc, 'utf8');
    fs.writeFileSync(backlogRulesDest, rawRules.replace(/<PROJECT>/g, name), 'utf8');
    console.log('  ✅ 已创建: docs/backlogs/IRONRULES.md (待办捕获铁律)');
  }

  const backlogTplSrc = path.join(UNITS_DIR, 'backlog', 'templates', 'entry.md');
  const backlogTplDest = path.join(cwd, 'docs', 'backlogs', 'template.md');
  if (fs.existsSync(backlogTplSrc) && !fs.existsSync(backlogTplDest)) {
    fs.copyFileSync(backlogTplSrc, backlogTplDest);
  }

  // 5. Preflight 不变量探针 & 门禁脚本
  const preflightSrc = path.join(UNITS_DIR, 'preflight', 'templates', 'preflight.sh');
  const preflightDest = path.join(cwd, 'scripts', 'preflight.sh');
  if (fs.existsSync(preflightSrc) && !fs.existsSync(preflightDest)) {
    fs.copyFileSync(preflightSrc, preflightDest);
    try { fs.chmodSync(preflightDest, 0o755); } catch {}
    console.log('  ✅ 已创建: scripts/preflight.sh (仓库不变量探针)');
  }

  const checkWrapupSrc = path.join(UNITS_DIR, 'preflight', 'templates', 'check.sh');
  const checkWrapupDest = path.join(cwd, 'scripts', 'check-wrapup.sh');
  if (fs.existsSync(checkWrapupSrc) && !fs.existsSync(checkWrapupDest)) {
    fs.copyFileSync(checkWrapupSrc, checkWrapupDest);
    try { fs.chmodSync(checkWrapupDest, 0o755); } catch {}
  }

  const wrapupDocSrc = path.join(UNITS_DIR, 'preflight', 'templates', 'wrap-up.md');
  const wrapupDocDest = path.join(cwd, 'docs', 'templates', 'wrap-up.md');
  if (fs.existsSync(wrapupDocSrc) && !fs.existsSync(wrapupDocDest)) {
    fs.copyFileSync(wrapupDocSrc, wrapupDocDest);
  }

  const preflightConfDest = path.join(cwd, 'preflight.conf');
  if (!fs.existsSync(preflightConfDest)) {
    const confContent = `# preflight.conf — 项目级不变量探针配置 (AEF v1.0)
# 覆盖层级：env > preflight.conf > 脚本内置默认

# A1 运行产物忽略状态（空格分隔：应被 .gitignore 覆盖、且不得被 git 跟踪）
RUNTIME_PATHS="node_modules/ dist/ build/ .codegraph/ .sessions/ .watch/"

# A2 根文档行数预算（空格分隔：file:maxLines）
DOC_BUDGETS="AGENTS.md:150 README.md:400"

# A3 backlog 任务条目格式
BACKLOG_DIR="docs/backlogs"
BACKLOG_HEAD="^## B-"
BACKLOG_TYPE="类型"
`;
    fs.writeFileSync(preflightConfDest, confContent, 'utf8');
    console.log('  ✅ 已创建: preflight.conf (不变量探针配置)');
  }

  // 6. Git Pre-Commit 分发器与门禁自动挂载
  const hookDispatcherSrc = path.join(UNITS_DIR, 'preflight', 'templates', 'pre-commit');
  const hookDispatcherDest = path.join(cwd, '.githooks', 'pre-commit');
  if (fs.existsSync(hookDispatcherSrc)) {
    fs.copyFileSync(hookDispatcherSrc, hookDispatcherDest);
    try { fs.chmodSync(hookDispatcherDest, 0o755); } catch {}
    console.log('  ✅ 已就绪: .githooks/pre-commit (Git 门禁分发器)');
  }

  const hookPreflightSrc = path.join(UNITS_DIR, 'preflight', 'templates', 'pre-commit.d', '20-preflight');
  const hookPreflightDest = path.join(cwd, '.githooks', 'pre-commit.d', '20-preflight');
  if (fs.existsSync(hookPreflightSrc)) {
    fs.copyFileSync(hookPreflightSrc, hookPreflightDest);
    try { fs.chmodSync(hookPreflightDest, 0o755); } catch {}
  }

  const hookOrphanSrc = path.join(UNITS_DIR, 'orphan', 'templates', 'pre-commit.d', '30-orphan-guard');
  const hookOrphanDest = path.join(cwd, '.githooks', 'pre-commit.d', '30-orphan-guard');
  if (fs.existsSync(hookOrphanSrc)) {
    fs.copyFileSync(hookOrphanSrc, hookOrphanDest);
    try { fs.chmodSync(hookOrphanDest, 0o755); } catch {}
  }

  // 自动激活 Git Hooks
  const isGitRepo = fs.existsSync(path.join(cwd, '.git'));
  if (isGitRepo) {
    try {
      execSync('git config core.hooksPath .githooks', { cwd, stdio: 'pipe' });
      console.log('  ✅ 已自动激活 Git 门禁: git config core.hooksPath .githooks');
    } catch {
      console.warn('  ⚠️  激活 core.hooksPath 失败，请手工执行: git config core.hooksPath .githooks');
    }
  } else {
    console.log('  ℹ️  提示: 当前目录尚未执行 git init，在 git init 后执行 "git config core.hooksPath .githooks" 即可激活门禁');
  }

  // 7. .gitignore 智能维护
  const gitignoreDest = path.join(cwd, '.gitignore');
  const defaultIgnores = [
    'node_modules/',
    'dist/',
    'build/',
    '.codegraph/',
    '.DS_Store',
    '.sessions/',
    '.watch/',
    '.secrets/',
    '.handoffs/.latest-prompt.txt',
    '.handoffs/.unwatched-debt.json',
  ];
  if (!fs.existsSync(gitignoreDest)) {
    fs.writeFileSync(gitignoreDest, defaultIgnores.join('\n') + '\n', 'utf8');
    console.log('  ✅ 已创建: .gitignore');
  } else {
    try {
      const curGitignore = fs.readFileSync(gitignoreDest, 'utf8');
      const missing = defaultIgnores.filter(ig => !curGitignore.includes(ig.replace(/\/$/, '')));
      if (missing.length > 0) {
        fs.appendFileSync(gitignoreDest, '\n# Lab AEF runtime\n' + missing.join('\n') + '\n', 'utf8');
        console.log('  ✅ 已在 .gitignore 中补充 AEF 运行时忽略项');
      }
    } catch {}
  }

  // 8. 全客户端载体一等公民 (AGENTS.md, CODEBUDDY.md, .cursorrules, .github/copilot-instructions.md)
  const agentsDest = path.join(cwd, 'AGENTS.md');
  if (!fs.existsSync(agentsDest)) {
    const agentsContent = `# ${name} — Agent 指挥官规范

## Overview
${name} 项目（采用 ZSpec / AEF v1.0 架构）。

## Repository Layout
\`\`\`
constitution.md      最高宪法（单一事实源、修改须人类批准）
group/               全局事实层
  ├── product/       产品意图 (intent.md)
  ├── architecture/  拓扑依赖图 (dependency-graph.md)
  └── contracts/     共享契约 (api.md)
units/<端名>/        各端独立工程上下文（如 web, ios, backend）
specs/               Spec Kit 特性规格 (spec -> plan -> tasks)
docs/backlogs/       待办捕获跟踪
docs/adr/            架构决策记录 (ADR)
\`\`\`

## 上下文读取顺序（严格遵循）
1. 本文件 (\`AGENTS.md\`) -> 了解全局结构与规则
2. 目标端规则 (\`units/<当前端>/AGENTS.md\`) -> 了解本端专属技术栈与验证指令
3. 最高宪法 (\`constitution.md\`) -> 核验不变量边界
4. 共享契约 (\`group/contracts/\`) -> 如涉及跨端改动

## 工程纪律机件 (Lab Toolkit 驱动)
- **任务交割**：跨端/跨仓协作与闭环使用全局 \`baton\` / \`handoff\` 命令
- **提交门禁**：改动前跑 \`bash scripts/preflight.sh\`，提交时由 \`.githooks/pre-commit\` 拦截
- **ADR 架构决策**：按 \`docs/adr/INDEX.md\` 规范执行，重大决策更新 \`docs/adr/\`
- **待办捕获**：识别到越界/未来事项按 \`docs/backlogs/IRONRULES.md\` 记录入 \`docs/backlogs/\`

## Context Budget
本文件严格控制在 150 行以内。详细细则按需懒加载，严禁大段复制规则正文。
`;
    fs.writeFileSync(agentsDest, agentsContent, 'utf8');
    console.log('  ✅ 已创建: AGENTS.md (通用 Agent 指挥官规范)');
  }

  const codebuddyDest = path.join(cwd, 'CODEBUDDY.md');
  if (!fs.existsSync(codebuddyDest)) {
    const codebuddyContent = `# ${name} — WorkBuddy / CodeBuddy Guidelines

## Overview
本仓库采用 AEF v1.0 (Agent Engineering Framework) 规范。
全局规范请参阅 \`AGENTS.md\` 与 \`constitution.md\`。

## 工程纪律
- 任务交接：使用 \`baton\` / \`handoff\` 协同
- 提交门禁：运行 \`bash scripts/preflight.sh\`
`;
    fs.writeFileSync(codebuddyDest, codebuddyContent, 'utf8');
    console.log('  ✅ 已创建: CODEBUDDY.md (WorkBuddy/CodeBuddy 载体)');
  }

  const cursorDest = path.join(cwd, '.cursorrules');
  if (!fs.existsSync(cursorDest)) {
    fs.writeFileSync(cursorDest, `# Cursor Rules — ${name}\n\nSee AGENTS.md for full engineering guidelines.\n`, 'utf8');
    console.log('  ✅ 已创建: .cursorrules (Cursor 载体)');
  }

  const copilotDir = path.join(cwd, '.github');
  fs.mkdirSync(copilotDir, { recursive: true });
  const copilotDest = path.join(copilotDir, 'copilot-instructions.md');
  if (!fs.existsSync(copilotDest)) {
    fs.writeFileSync(copilotDest, `# GitHub Copilot Instructions — ${name}\n\nSee AGENTS.md for full engineering guidelines.\n`, 'utf8');
    console.log('  ✅ 已创建: .github/copilot-instructions.md (Copilot 载体)');
  }

  // 9. 自动注入 / 刷新 Baton 接入桩
  try {
    const batonBin = path.join(UNITS_DIR, 'handoffs', 'handoff.mjs');
    if (fs.existsSync(batonBin)) {
      execFileSync(process.execPath, [batonBin, 'install', '--project'], { cwd, encoding: 'utf8', stdio: 'pipe' });
      console.log('  ✅ 已自动注入: Agent Baton 接入桩 (覆盖 AGENTS/CODEBUDDY/.cursorrules/copilot)');
    }
  } catch (e) {
    // Fail-open
  }

  // 10. 小白友好开箱卡片输出
  console.log(`
\x1b[1;32m══════════════════════════════════════════════════════════════════════════\x1b[0m
🎉 \x1b[1;32m[Lab AEF v1.0] 全套工程规范一键初始化成功！\x1b[0m
\x1b[1;32m══════════════════════════════════════════════════════════════════════════\x1b[0m

📦 \x1b[1m已就绪工程机件清单 (All-in-One Capabilities Ready):\x1b[0m
  1. \x1b[36m任务交接中枢 (Baton)\x1b[0m       : .handoffs/ 与全客户端接入桩已就绪
  2. \x1b[36m提交前不变量探针 (Preflight)\x1b[0m  : scripts/preflight.sh 与 preflight.conf
  3. \x1b[36mGit 提交物理门禁 (Fast Gate)\x1b[0m : .githooks/pre-commit (自动挂载)
  4. \x1b[36m死代码与孤儿防线 (Anti-Orphan)\x1b[0m: .githooks/pre-commit.d/30-orphan-guard
  5. \x1b[36m架构决策记忆 (ADR)\x1b[0m            : docs/adr/ (首篇决策已就绪)
  6. \x1b[36m待办捕获跟踪 (Backlog)\x1b[0m        : docs/backlogs/ (一任务一文件)
  7. \x1b[36m全 AI 客户端支持\x1b[0m              : Cursor / WorkBuddy / Copilot / Claude 载体

💡 \x1b[1;33m小白开箱常用 3 条命令 (Cheat-Sheet):\x1b[0m
  • 查看待办工单: \x1b[32mbaton status\x1b[0m
  • 派发新任务单: \x1b[32mbaton new impl task "实现某某特性"\x1b[0m
  • 提交前自检:   \x1b[32mbash scripts/preflight.sh\x1b[0m

\x1b[33mAI Agent 下一步建议:\x1b[0m
  1. 完善产品意图: 编辑 group/product/intent.md 写入本项目的核心问题
  2. 划分端/模块:  运行 "lab zspec add-unit <端名>" (如 web, backend, ios)
\x1b[1;32m══════════════════════════════════════════════════════════════════════════\x1b[0m
`);
}

function zspecInit(projectName) {
  return initProject(projectName);
}

function zspecAddUnit(unitName) {
  if (!unitName) {
    console.error('错误: 请指定 Unit 名称，例如 "lab zspec add-unit frontend"');
    process.exit(1);
  }
  const cwd = process.cwd();
  const unitDir = path.join(cwd, 'units', unitName);
  fs.mkdirSync(unitDir, { recursive: true });

  const unitAgents = path.join(unitDir, 'AGENTS.md');
  if (!fs.existsSync(unitAgents)) {
    const content = `# ${unitName} Unit

## Overview
这是 ${unitName} 端的独立自治工程上下文。

## Tech Stack
- 语言与框架基线: 
- 构建工具: 

## Responsibilities
- 负责范围: 
- **明确不负责范围**: 

## Verification (可执行命令)
| 级别 | 命令 |
|---|---|
| E2 Build |  |
| E3 Test  |  |

## 隔离禁令
- ❌ 严禁直接修改其他 Unit 的实现代码
- ❌ 跨端接口改动必须先修改 group/contracts/api.md
`;
    fs.writeFileSync(unitAgents, content, 'utf8');
  }

  const unitReadme = path.join(unitDir, 'README.md');
  if (!fs.existsSync(unitReadme)) {
    fs.writeFileSync(unitReadme, `# ${unitName} 模块自述\n`, 'utf8');
  }

  console.log(`\n✅ 已成功为项目创建 Unit: \x1b[36munits/${unitName}/\x1b[0m`);
  console.log(`   - units/${unitName}/AGENTS.md (端上下文指令)`);
  console.log(`   - units/${unitName}/README.md\n`);
}

function zspecGuide() {
  const guidePath = path.join(UNITS_DIR, 'playbook', 'ZSPEC-AGENT-GUIDE.md');
  if (fs.existsSync(guidePath)) {
    console.log(fs.readFileSync(guidePath, 'utf8'));
  } else {
    console.log(`指南文件路径: ${guidePath}`);
  }
}

// ── 外部模块子命令透明转发器 ──────────────────────────────────────────
function forwardToBinary(binPath, subArgs = [], isShell = false) {
  if (!fs.existsSync(binPath)) {
    console.error(`错误: 未找到模块执行文件: ${binPath}`);
    process.exit(1);
  }
  try {
    if (isShell) {
      execFileSync(binPath, subArgs, { stdio: 'inherit' });
    } else {
      execFileSync(process.execPath, [binPath, ...subArgs], { stdio: 'inherit' });
    }
  } catch (err) {
    process.exit(err.status !== undefined && err.status !== null ? err.status : 1);
  }
}

// ── 命令行路由 ────────────────────────────────────────────────────────
switch (command) {
  case '--version':
  case '-v':
  case 'version':
    console.log(`reasonweave v${LAB_VERSION}`);
    process.exit(0);
    break;
  case 'list':
  case 'ls':
    listUnits();
    break;
  case 'path':
    getPath(args[1]);
    break;
  case 'doctor':
  case 'check':
    doctor();
    break;
  case 'sync-consumers': {
    const scriptPath = path.join(PKG_ROOT, 'scripts', 'sync-all-consumers.mjs');
    forwardToBinary(scriptPath, args.slice(1));
    break;
  }
  case 'baton':
  case 'handoff':
  case 'agent-baton': {
    const batonBin = path.join(UNITS_DIR, 'handoffs', 'handoff.mjs');
    forwardToBinary(batonBin, args.slice(1));
    break;
  }
  case 'worktree':
  case 'baton-worktree': {
    const wtBin = path.join(UNITS_DIR, 'worktree', 'worktree.mjs');
    forwardToBinary(wtBin, args.slice(1));
    break;
  }
  case 'audit-runner':
  case 'baton-audit-runner':
  case 'review-gate': {
    const auditBin = path.join(UNITS_DIR, 'review-gate', 'clean-runner.mjs');
    forwardToBinary(auditBin, args.slice(1));
    break;
  }
  case 'orphan':
  case 'lab-orphan': {
    const orphanBin = path.join(UNITS_DIR, 'orphan', 'bin', 'lab-orphan.mjs');
    forwardToBinary(orphanBin, args.slice(1));
    break;
  }
  case 'spec-guard':
  case 'drift-gate': {
    const specGuardBin = path.join(UNITS_DIR, 'spec-guard', 'bin', 'spec-guard.mjs');
    forwardToBinary(specGuardBin, args.slice(1));
    break;
  }
  case 'adr':
  case 'adr-init': {
    const adrBin = path.join(UNITS_DIR, 'adr', 'scripts', 'adr-init.sh');
    forwardToBinary(adrBin, args.slice(1), true);
    break;
  }
  case 'preflight': {
    const preflightBin = path.join(UNITS_DIR, 'preflight', 'templates', 'preflight.sh');
    forwardToBinary(preflightBin, args.slice(1), true);
    break;
  }
  case 'migrate': {
    const isDry = args.includes('--dry-run');
    const dirArg = args.find((a, idx) => idx > 0 && !a.startsWith('--'));
    migrate(dirArg, isDry);
    break;
  }
  case 'init': {
    initProject(args[1], args.slice(2));
    break;
  }
  case 'zspec': {
    const sub = args[1];
    if (sub === 'init') {
      zspecInit(args[2]);
    } else if (sub === 'add-unit') {
      zspecAddUnit(args[2]);
    } else if (sub === 'guide') {
      zspecGuide();
    } else {
      console.log(`
用法:
  lab zspec init [name]      按 ZSpec 标准初始化骨架与文档
  lab zspec add-unit <name>  新增一个自治端 (Unit)
  lab zspec guide            打印面向 AI Agent 的 ZSpec 实战操作规范
`);
    }
    break;
  }
  case 'help':
  case '--help':
  case '-h':
  default:
    showHelp();
    break;
}
