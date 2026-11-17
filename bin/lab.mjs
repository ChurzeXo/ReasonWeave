#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execSync, execFileSync } from 'node:child_process';

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UNITS_DIR = path.join(PKG_ROOT, 'units');
const TEMPLATES_DIR = path.join(UNITS_DIR, 'playbook', 'templates');

const args = process.argv.slice(2);
const command = args[0] || 'help';

function showHelp() {
  console.log(`
Lab Agent Engineering Toolkit (AEF v1.0)

用法:
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
  console.log('\n🔍 正在检查环境依赖:\n');
  const checks = [
    { name: 'Node.js (>=18)', cmd: 'node -v', required: true },
    { name: 'Git', cmd: 'git --version', required: true },
    { name: 'OpenGrep (review-gate L1)', cmd: 'opengrep --version', required: false },
  ];

  for (const c of checks) {
    try {
      const out = execSync(c.cmd, { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
      console.log(`  ✅ \x1b[32m${c.name.padEnd(28)}\x1b[0m: ${out}`);
    } catch {
      if (c.required) {
        console.log(`  ❌ \x1b[31m${c.name.padEnd(28)}\x1b[0m: 未安装或不在 PATH 中 (必需)`);
      } else {
        console.log(`  ⚠️  \x1b[33m${c.name.padEnd(28)}\x1b[0m: 未安装 (可选，仅 review-gate 扫描需要)`);
      }
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
      repl: '运行 `handoff link` 自愈（或通过 lab-agent-toolkit 重新 `npm link`）。',
    },
    {
      reg: /先用全路径\s+`handoff\s+<op>`\s*兜底，再跑一次\s+`handoff\s+link`\s*自愈。?/g,
      repl: '运行 `handoff link` 自愈（或通过 lab-agent-toolkit 重新 `npm link`）。',
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

// ── ZSpec 脚手架与 Agent 规范 ──────────────────────────────────────────
function zspecInit(projectName) {
  const name = projectName || path.basename(process.cwd());
  const cwd = process.cwd();

  console.log(`\n🏗️  正在按 ZSpec (AEF v1.0) 规范初始化项目: \x1b[32m${name}\x1b[0m\n`);

  const dirs = [
    'group/product',
    'group/architecture',
    'group/contracts',
    'units',
    'specs',
    'docs/backlogs',
  ];

  for (const d of dirs) {
    fs.mkdirSync(path.join(cwd, d), { recursive: true });
  }

  // 1. 生成 constitution.md
  const constSrc = path.join(TEMPLATES_DIR, 'constitution.md');
  let constContent = fs.existsSync(constSrc)
    ? fs.readFileSync(constSrc, 'utf8').replace(/<PROJECT>/g, name).replace(/<项目名>/g, name)
    : `# ${name} Constitution\n\nVersion: 1.0\n`;
  const constDest = path.join(cwd, 'constitution.md');
  if (!fs.existsSync(constDest)) {
    fs.writeFileSync(constDest, constContent, 'utf8');
    console.log('  ✅ 已创建: constitution.md (最高宪法)');
  }

  // 2. 生成 group/product/intent.md
  const intentSrc = path.join(TEMPLATES_DIR, 'group', 'product', 'intent.md');
  let intentContent = fs.existsSync(intentSrc)
    ? fs.readFileSync(intentSrc, 'utf8').replace(/<项目名>/g, name)
    : `# ${name} 产品意图\n\n## 核心问题\n\n## 关键用户旅程\n`;
  const intentDest = path.join(cwd, 'group', 'product', 'intent.md');
  if (!fs.existsSync(intentDest)) {
    fs.writeFileSync(intentDest, intentContent, 'utf8');
    console.log('  ✅ 已创建: group/product/intent.md (共享产品意图事实源)');
  }

  // 3. 生成 group/architecture/dependency-graph.md
  const depSrc = path.join(TEMPLATES_DIR, 'group', 'architecture', 'dependency-graph.md');
  let depContent = fs.existsSync(depSrc)
    ? fs.readFileSync(depSrc, 'utf8').replace(/<项目名>/g, name)
    : `# ${name} 架构与依赖拓扑\n\n## Units 清单\n`;
  const depDest = path.join(cwd, 'group', 'architecture', 'dependency-graph.md');
  if (!fs.existsSync(depDest)) {
    fs.writeFileSync(depDest, depContent, 'utf8');
    console.log('  ✅ 已创建: group/architecture/dependency-graph.md (共享拓扑依赖事实源)');
  }

  // 4. 生成 group/contracts/api.md
  const apiSrc = path.join(TEMPLATES_DIR, 'group', 'contracts', 'api.md');
  let apiContent = fs.existsSync(apiSrc)
    ? fs.readFileSync(apiSrc, 'utf8').replace(/<项目名>/g, name)
    : `# ${name} 共享 API 契约\n`;
  const apiDest = path.join(cwd, 'group', 'contracts', 'api.md');
  if (!fs.existsSync(apiDest)) {
    fs.writeFileSync(apiDest, apiContent, 'utf8');
    console.log('  ✅ 已创建: group/contracts/api.md (共享接口契约)');
  }

  // 5. 生成根 AGENTS.md (预置完整接线与上下文预算要求)
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
\`\`\`

## 上下文读取顺序（严格遵循）
1. 本文件 (\`AGENTS.md\`) -> 了解全局结构与规则
2. 目标端规则 (\`units/<当前端>/AGENTS.md\`) -> 了解本端专属技术栈与验证指令
3. 最高宪法 (\`constitution.md\`) -> 核验不变量边界
4. 共享契约 (\`group/contracts/\`) -> 如涉及跨端改动

## 工程纪律机件 (Lab Toolkit 驱动)
- **ADR 架构决策**：按 \`$(lab path adr)/README.md\` 规范执行，新建决策跑 \`adr-init . standard "${name}"\`
- **待办捕获**：识别到越界/未来事项按 \`$(lab path backlog)/README.md\` 记录入 \`docs/backlogs/\`
- **提交门禁**：改动前跑 \`$(lab path preflight)/templates/preflight.sh\`
- **代码扫描**：代码评审参考 \`$(lab path review-gate)/README.md\`
- **工作流交接**：跨端/跨仓协作使用全局 \`handoff\` 命令
- **方法论全集**：参考 \`$(lab path playbook)/README.md\`

## Context Budget
本文件严格控制在 150 行以内。详细细则按需懒加载，严禁大段复制规则正文。
`;
    fs.writeFileSync(agentsDest, agentsContent, 'utf8');
    console.log('  ✅ 已创建: AGENTS.md (根指挥官规则，已接入 lab-agent-toolkit)');
  }

  console.log(`\n🎉 ZSpec 标准骨架创建完成！\n`);
  console.log(`\x1b[33mAI Agent 下一步操作提示 (Next Actions for Agent):\x1b[0m`);
  console.log(`  1. 填空事实: 编辑 group/product/intent.md 写入本项目的核心问题与用户旅程`);
  console.log(`  2. 划分端: 运行 "lab zspec add-unit <端名>" 创建各端自治上下文 (如 web, backend, ios)`);
  console.log(`  3. 初始化 ADR: 运行 "adr-init . standard \\"${name}\\"" 生成初始架构记录`);
  console.log(`  4. 查阅完整 Agent 规范指南: 运行 "lab zspec guide"\n`);
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
