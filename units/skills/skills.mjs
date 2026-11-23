#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getSkillsVersion() {
  try {
    const versionPath = path.join(__dirname, 'VERSION.md');
    if (fs.existsSync(versionPath)) {
      const content = fs.readFileSync(versionPath, 'utf8').trim();
      const match = content.match(/v?(\d+\.\d+\.\d+)/);
      if (match) return match[1];
    }
  } catch {}
  return '0.1.0';
}

const VERSION = getSkillsVersion();
const CATALOG_DIR = path.join(__dirname, 'catalog');

function printHelp() {
  console.log(`
ReasonWeave Skills CLI · v${VERSION} (units/skills)
微观工程原子技能库与分发引擎

用法:
  lab-skills --version, -v          打印当前版本
  lab-skills --help, -h             显示帮助信息
  lab-skills list                   列出官方微观原子技能目录及状态
  lab-skills install [选项]         安装/挂载技能至目标工作区或全局
  lab-skills check                  体检技能体积（<20KB）与元数据规范
  lab-skills brief <plan> <id>      提取指定计划中的单任务切片 Brief
  lab-skills review <base> <head>   生成审查用差分包文件

安装选项:
  --project                         安装到当前项目 (.agents/skills/) [默认]
  --global                          安装到用户全局 (~/.agents/skills/)
  --copy                            使用物理复制代替符号链接 (默认: 软链)
`);
}

function listSkills() {
  if (!fs.existsSync(CATALOG_DIR)) {
    return [];
  }

  const entries = fs.readdirSync(CATALOG_DIR, { withFileTypes: true });
  const skills = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const skillFile = path.join(CATALOG_DIR, entry.name, 'SKILL.md');
      if (fs.existsSync(skillFile)) {
        const content = fs.readFileSync(skillFile, 'utf8');
        const size = Buffer.byteLength(content, 'utf8');
        const descMatch = content.match(/description:\s*(.+)/i);
        const desc = descMatch ? descMatch[1].trim() : '无描述';
        skills.push({
          name: entry.name,
          size,
          description: desc,
          path: skillFile,
        });
      }
    }
  }

  return skills;
}

function checkSkills() {
  const skills = listSkills();
  const LIMIT = 20000;
  let hasError = false;

  console.log(`🔍 正在核验官方微观技能规范 (上限: ${LIMIT} bytes):`);

  for (const s of skills) {
    const isUnderLimit = s.size < LIMIT;
    const status = isUnderLimit ? '✅' : '❌';
    console.log(`  ${status} ${s.name.padEnd(32)}: ${s.size} bytes`);
    if (!isUnderLimit) {
      console.error(`     ⚠️ 超出 20KB 预算！请将详细内容移至 references/ 子目录。`);
      hasError = true;
    }
  }

  return !hasError;
}

function installSkills(options = {}) {
  const targetDir = options.global
    ? path.join(os.homedir(), '.agents', 'skills')
    : path.join(process.cwd(), '.agents', 'skills');

  fs.mkdirSync(targetDir, { recursive: true });

  const skills = listSkills();
  const installed = [];

  for (const s of skills) {
    const srcDir = path.dirname(s.path);
    const destDir = path.join(targetDir, s.name);

    if (fs.existsSync(destDir)) {
      // Clean up existing link or directory
      fs.rmSync(destDir, { recursive: true, force: true });
    }

    if (options.copy) {
      fs.cpSync(srcDir, destDir, { recursive: true });
    } else {
      fs.symlinkSync(srcDir, destDir, 'junction');
    }

    installed.push({ name: s.name, dest: destDir });
  }

  return { targetDir, installed };
}

function run(args = process.argv.slice(2)) {
  const cmd = args[0];

  if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') {
    printHelp();
    process.exit(0);
  }

  if (cmd === '--version' || cmd === '-v' || cmd === 'version') {
    console.log(`v${VERSION}`);
    process.exit(0);
  }

  if (cmd === 'list') {
    const skills = listSkills();
    console.log(`\n📦 官方微观工程原子技能库 (v${VERSION}):\n`);
    for (const s of skills) {
      console.log(`  • \x1b[36m${s.name}\x1b[0m (${s.size} bytes)`);
      console.log(`    ${s.description}\n`);
    }
    process.exit(0);
  }

  if (cmd === 'check') {
    const ok = checkSkills();
    process.exit(ok ? 0 : 1);
  }

  if (cmd === 'install') {
    const isGlobal = args.includes('--global');
    const isCopy = args.includes('--copy');
    const result = installSkills({ global: isGlobal, copy: isCopy });
    console.log(`✅ 成功安装 ${result.installed.length} 项微观技能至: ${result.targetDir}`);
    for (const item of result.installed) {
      console.log(`  • ${item.name} -> ${item.dest}`);
    }
    process.exit(0);
  }

  if (cmd === 'brief') {
    import('./bin/task-brief.mjs').then((m) => m.run(args.slice(1)));
    return;
  }

  if (cmd === 'review') {
    import('./bin/review-package.mjs').then((m) => m.run(args.slice(1)));
    return;
  }

  console.error(`未知命令: ${cmd}。运行 lab-skills --help 查看帮助。`);
  process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  run();
}
