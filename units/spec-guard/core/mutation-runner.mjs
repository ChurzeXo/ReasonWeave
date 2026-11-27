/**
 * mutation-runner.mjs
 *
 * 轻量级变异测试契约引擎（Mutation Sensitivity Runner）：
 * 1. 防御回音壁假测试（Echo-Chamber Tests）：断言恒真、过度 Mock、篡改端点/条件仍全绿的自欺欺人测试
 * 2. 自动化注入变异（端点篡改、布尔倒置、比较取反、返回值破坏）
 * 3. 运行测试套件：变异注入后测试必须爆红（Exit !== 0）；若依然全绿（Exit === 0），判定为回音壁假测试并阻断
 * 4. 必须使用 try...finally 严格恢复原始文件，确保测试前后工作区零污染
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

export const MutationType = {
  ENDPOINT: 'endpoint',
  BOOLEAN: 'boolean',
  OPERATOR: 'operator',
  RETURN: 'return',
  AUTO: 'auto',
};

/**
 * 在目标文本中提取可变异候选点
 * @param {string} content
 * @param {string} [type='auto']
 * @returns {Array<{ type: string, line: number, original: string, replacement: string, lineText: string, index: number }>}
 */
export function generateMutants(content, type = 'auto') {
  const lines = content.split('\n');
  const mutants = [];

  let curIdx = 0;
  for (let lineNo = 1; lineNo <= lines.length; lineNo++) {
    const lineText = lines[lineNo - 1];
    const trimmed = lineText.trim();

    // 跳过纯注释行
    if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
      curIdx += lineText.length + 1;
      continue;
    }

    // 1. Endpoint / URL 变异
    if (type === 'auto' || type === 'endpoint') {
      const endpointRegex = /["'](\/(?:[a-zA-Z0-9_.-]+\/)*[a-zA-Z0-9_.-]+|https?:\/\/[^"']+|wss?:\/\/[^"']+)["']/g;
      let epMatch;
      while ((epMatch = endpointRegex.exec(lineText)) !== null) {
        const fullMatch = epMatch[0];
        const quote = fullMatch[0];
        const originalVal = epMatch[1];
        if (originalVal === '/BOGUS_PATH' || originalVal === '/MUTATION_BOGUS_ENDPOINT_MUTANT') continue;
        mutants.push({
          type: 'endpoint',
          line: lineNo,
          original: fullMatch,
          replacement: `${quote}/MUTATION_BOGUS_ENDPOINT_MUTANT${quote}`,
          lineText: trimmed,
          index: curIdx + epMatch.index,
        });
      }
    }

    // 2. Return 语句破坏
    if (type === 'auto' || type === 'return') {
      if (/\breturn\s+True\b/.test(lineText)) {
        const idx = lineText.indexOf('return True');
        mutants.push({
          type: 'return',
          line: lineNo,
          original: 'return True',
          replacement: 'return False',
          lineText: trimmed,
          index: curIdx + idx,
        });
      } else if (/\breturn\s+true\b/.test(lineText)) {
        const idx = lineText.indexOf('return true');
        mutants.push({
          type: 'return',
          line: lineNo,
          original: 'return true',
          replacement: 'return false',
          lineText: trimmed,
          index: curIdx + idx,
        });
      }
    }

    // 3. Boolean 变异
    if (type === 'auto' || type === 'boolean') {
      const boolRegex = /\b(true|false|True|False)\b/g;
      let bMatch;
      while ((bMatch = boolRegex.exec(lineText)) !== null) {
        const val = bMatch[1];
        let rep = '';
        if (val === 'true') rep = 'false';
        else if (val === 'false') rep = 'true';
        else if (val === 'True') rep = 'False';
        else if (val === 'False') rep = 'True';
        mutants.push({
          type: 'boolean',
          line: lineNo,
          original: val,
          replacement: rep,
          lineText: trimmed,
          index: curIdx + bMatch.index,
        });
      }
    }

    // 4. Operator 变异
    if (type === 'auto' || type === 'operator') {
      if (lineText.includes('===') && !lineText.includes('!==')) {
        const idx = lineText.indexOf('===');
        mutants.push({
          type: 'operator',
          line: lineNo,
          original: '===',
          replacement: '!==',
          lineText: trimmed,
          index: curIdx + idx,
        });
      } else if (lineText.includes('==') && !lineText.includes('!=') && !lineText.includes('===')) {
        const idx = lineText.indexOf('==');
        mutants.push({
          type: 'operator',
          line: lineNo,
          original: '==',
          replacement: '!=',
          lineText: trimmed,
          index: curIdx + idx,
        });
      }
    }

    curIdx += lineText.length + 1;
  }

  // auto 模式下优先选用最具破坏力的 endpoint 变异或 return 变异
  if (type === 'auto') {
    const endpoints = mutants.filter((m) => m.type === 'endpoint');
    if (endpoints.length > 0) return endpoints;
    const returns = mutants.filter((m) => m.type === 'return');
    if (returns.length > 0) return returns;
  }

  return mutants;
}

/**
 * 执行变异测试敏感度反向校验
 * @param {object} options
 * @param {string} [options.repoRoot=process.cwd()]
 * @param {string} options.targetFile 变异目标文件路径
 * @param {string} options.testCmd 待执行的测试命令
 * @param {string} [options.mutator='auto'] 变异类型 ('auto'|'endpoint'|'boolean'|'operator'|'return')
 * @returns {{
 *   status: 'MUTATION_KILLED' | 'MUTATION_SURVIVED' | 'BASELINE_FAILED' | 'NO_MUTANTS',
 *   exitCode: number,
 *   message: string,
 *   mutant?: object,
 *   killedCount?: number,
 *   survivedCount?: number,
 * }}
 */
export function runMutationTest(options = {}) {
  const repoRoot = options.repoRoot || process.cwd();
  const targetFile = options.targetFile ? path.resolve(repoRoot, options.targetFile) : '';
  const testCmd = options.testCmd || '';
  const mutator = options.mutator || 'auto';

  if (!testCmd) {
    throw new Error('Mutation runner requires a test command (--cmd "<command>")');
  }
  if (!targetFile || !fs.existsSync(targetFile)) {
    throw new Error(`Mutation runner target file not found: ${targetFile}`);
  }

  // 严格安全边界检查：确保 targetFile 位于 repoRoot 内部
  const realRepoRoot = fs.existsSync(repoRoot) ? fs.realpathSync(repoRoot) : path.resolve(repoRoot);
  const realTargetFile = fs.existsSync(targetFile) ? fs.realpathSync(targetFile) : path.resolve(targetFile);
  const relativeTarget = path.relative(realRepoRoot, realTargetFile);
  if (relativeTarget.startsWith('..') || path.isAbsolute(relativeTarget)) {
    throw new Error(`Mutation runner target file must be located inside repoRoot: ${targetFile}`);
  }

  const cleanEnv = { ...process.env };
  delete cleanEnv.NODE_TEST_CONTEXT;

  // 1. 基线检查 (Baseline Check)
  // 基线单测必须能够正常通过 (Exit 0)
  try {
    execSync(testCmd, { cwd: repoRoot, stdio: 'pipe', encoding: 'utf8', env: cleanEnv });
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString() : err.message;
    return {
      status: 'BASELINE_FAILED',
      exitCode: 1,
      message: `基线单测未通过，无法进行变异有效性校验: ${stderr}`,
      stderr,
    };
  }

  // 2. 提取变异体
  const originalContent = fs.readFileSync(targetFile, 'utf8');
  const mutants = generateMutants(originalContent, mutator);

  if (mutants.length === 0) {
    return {
      status: 'NO_MUTANTS',
      exitCode: 0,
      message: `在 ${path.relative(repoRoot, targetFile)} 中未找到可适用的变异点`,
      mutantsChecked: 0,
    };
  }

  // 3. 逐个注入变异并验证测试套件敏感度
  // 安全防护：在进程退出或意外中断时注册保护兜底
  let killedCount = 0;
  const survivedMutants = [];

  const cleanupHandler = () => {
    try {
      if (fs.existsSync(targetFile)) {
        fs.writeFileSync(targetFile, originalContent, 'utf8');
      }
    } catch {}
  };

  process.once('SIGINT', cleanupHandler);
  process.once('SIGTERM', cleanupHandler);
  process.once('exit', cleanupHandler);

  try {
    for (const mutant of mutants) {
      const mutatedContent =
        originalContent.slice(0, mutant.index) +
        mutant.replacement +
        originalContent.slice(mutant.index + mutant.original.length);

      try {
        fs.writeFileSync(targetFile, mutatedContent, 'utf8');

        let testPassedWithMutant = false;
        try {
          execSync(testCmd, { cwd: repoRoot, stdio: 'pipe', encoding: 'utf8', env: cleanEnv });
          testPassedWithMutant = true;
        } catch {
          // 测试报错 = 变异被消灭 (Killed)
          testPassedWithMutant = false;
        }

        if (testPassedWithMutant) {
          // 变异体存活 = 假测试！
          survivedMutants.push(mutant);
        } else {
          killedCount++;
        }
      } finally {
        // 必须立刻恢复原文件，保证工作区绝对干净零污染！
        fs.writeFileSync(targetFile, originalContent, 'utf8');
      }

      // 发现任何一个存活变异体，立即熔断报告
      if (survivedMutants.length > 0) {
        break;
      }
    }
  } finally {
    process.removeListener('SIGINT', cleanupHandler);
    process.removeListener('SIGTERM', cleanupHandler);
    process.removeListener('exit', cleanupHandler);
    cleanupHandler();
  }

  if (survivedMutants.length > 0) {
    const s = survivedMutants[0];
    return {
      status: 'MUTATION_SURVIVED',
      exitCode: 1,
      message: `🚨 变异敏感性校验失败：注入变异后测试未红，判定为回音壁假测试！(Mutation Survived: line ${s.line} '${s.original}' -> '${s.replacement}')`,
      mutant: s,
      killedCount,
      survivedCount: survivedMutants.length,
    };
  }

  return {
    status: 'MUTATION_KILLED',
    exitCode: 0,
    message: `✅ 变异敏感性自检通过：变异注入后测试精准爆红并被拦截 (Mutations Killed: ${killedCount})`,
    killedCount,
    survivedCount: 0,
  };
}
