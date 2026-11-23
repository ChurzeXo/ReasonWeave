#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

function printUsage() {
  console.error('用法: review-package <base_commit> <head_commit> [outfile]');
  console.error('示例: review-package main HEAD review.diff');
}

export function generateReviewPackage(base, head, options = {}) {
  const cwd = options.cwd || process.cwd();

  // Validate base and head
  try {
    execFileSync('git', ['rev-parse', '--verify', '--quiet', base], { cwd, stdio: 'ignore' });
  } catch {
    throw new Error(`无效的 BASE commit 或引用: ${base}`);
  }

  try {
    execFileSync('git', ['rev-parse', '--verify', '--quiet', head], { cwd, stdio: 'ignore' });
  } catch {
    throw new Error(`无效的 HEAD commit 或引用: ${head}`);
  }

  // Check ancestry
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', base, head], { cwd, stdio: 'ignore' });
  } catch {
    throw new Error(`HEAD 不是 BASE 的后代提交: ${base}..${head}`);
  }

  const commitCountStr = execFileSync('git', ['rev-list', '--count', `${base}..${head}`], { cwd, encoding: 'utf8' }).trim();
  const commitCount = parseInt(commitCountStr, 10);
  if (commitCount === 0) {
    throw new Error(`Commit 范围为空: ${base}..${head}`);
  }

  const logOutput = execFileSync('git', ['log', '--oneline', `${base}..${head}`], { cwd, encoding: 'utf8' });
  const statOutput = execFileSync('git', ['diff', '--stat', `${base}..${head}`], { cwd, encoding: 'utf8' });
  const diffOutput = execFileSync('git', ['diff', '-U10', `${base}..${head}`], { cwd, encoding: 'utf8' });

  const content = [
    `# Review Package: ${base}..${head}`,
    '',
    '## Commits',
    logOutput.trim(),
    '',
    '## Files Changed',
    statOutput.trim(),
    '',
    '## Net Diff',
    diffOutput.trim(),
    '',
  ].join('\n');

  return {
    content,
    commitCount,
  };
}

export function run(args = process.argv.slice(2)) {
  if (args.length < 2) {
    printUsage();
    process.exit(1);
  }

  const [base, head, customOutfile] = args;

  try {
    const pkg = generateReviewPackage(base, head);

    let outPath;
    if (customOutfile) {
      outPath = path.resolve(process.cwd(), customOutfile);
    } else {
      const outDir = path.join(process.cwd(), '.skills', 'reviews');
      fs.mkdirSync(outDir, { recursive: true });
      const baseShort = execFileSync('git', ['rev-parse', '--short', base], { encoding: 'utf8' }).trim();
      const headShort = execFileSync('git', ['rev-parse', '--short', head], { encoding: 'utf8' }).trim();
      outPath = path.join(outDir, `review-${baseShort}..${headShort}.diff`);
    }

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, pkg.content, 'utf8');

    const byteSize = fs.statSync(outPath).size;
    console.log(outPath);
  } catch (err) {
    console.error(`错误: ${err.message}`);
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  run();
}
