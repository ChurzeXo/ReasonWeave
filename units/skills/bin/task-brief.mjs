#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function printUsage() {
  console.error('用法: task-brief <plan_file> <task_id> [outfile]');
  console.error('示例: task-brief docs/plan.md 2 task-2-brief.md');
}

export function extractTaskBrief(planContent, targetTaskId) {
  const lines = planContent.split('\n');
  let inFence = false;
  let capturing = false;
  let capturedLines = [];
  let availableTasks = [];

  const taskHeadingRegex = /^#{1,6}\s+Task\s+([A-Za-z0-9]+(?:\.[A-Za-z0-9]+)*)/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('```')) {
      inFence = !inFence;
    }

    if (!inFence) {
      const match = line.match(taskHeadingRegex);
      if (match) {
        const foundId = match[1];
        availableTasks.push(foundId);

        if (capturing) {
          // If already capturing, encountering another top-level or sibling task heading ends capture
          // unless it's a sub-task (e.g. 2.1 under 2)
          if (!foundId.startsWith(targetTaskId + '.') && foundId !== targetTaskId) {
            break;
          }
        } else if (foundId.toLowerCase() === String(targetTaskId).toLowerCase()) {
          capturing = true;
          capturedLines.push(line);
          continue;
        }
      }
    }

    if (capturing) {
      capturedLines.push(line);
    }
  }

  return {
    found: capturing,
    content: capturedLines.join('\n').trim(),
    availableTasks,
  };
}

export function run(args = process.argv.slice(2)) {
  if (args.length < 2) {
    printUsage();
    process.exit(1);
  }

  const [planFile, taskId, customOutfile] = args;
  const absPlanPath = path.resolve(process.cwd(), planFile);

  if (!fs.existsSync(absPlanPath)) {
    console.error(`错误: 计划文件不存在: ${absPlanPath}`);
    process.exit(1);
  }

  const planContent = fs.readFileSync(absPlanPath, 'utf8');
  const result = extractTaskBrief(planContent, taskId);

  if (!result.found) {
    console.error(`错误: 在计划文件中未找到 Task ${taskId}。`);
    if (result.availableTasks.length > 0) {
      console.error(`可用任务标识: ${result.availableTasks.join(', ')}`);
    } else {
      console.error('计划文件中未检测到符合规范的 "# Task <ID>" 标题。');
    }
    process.exit(1);
  }

  let outPath;
  if (customOutfile) {
    outPath = path.resolve(process.cwd(), customOutfile);
  } else {
    const outDir = path.join(process.cwd(), '.skills', 'briefs');
    fs.mkdirSync(outDir, { recursive: true });
    outPath = path.join(outDir, `task-${taskId}-brief.md`);
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, result.content + '\n', 'utf8');

  console.log(outPath);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  run();
}
